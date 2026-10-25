#!/usr/bin/env python3
"""Ingest OpenStreetMap / OpenRailwayMap railway data into the TrainSim world database.

Scope: every station in docs/stations.xlsx (or the --lines you pick), located in OSM,
plus everything within --radius-km (default 20 km) of those stations.

Sources (all produce identical tables):
  --source overpass   (default) tiled Overpass API queries; needs only Python 3.10+ and internet
  --source geofabrik  downloads queensland-latest.osm.pbf; needs osmium-tool
  --source pbf FILE   a local .osm.pbf; needs osmium-tool
  --source file FILE  Overpass JSON or OSM XML files you already have

Re-running is safe: every row is upserted by OSM id, derived layers are rebuilt in
one transaction, and rows you create by hand with negative ids are never touched.

Examples
  python3 scripts/ingest_osm.py                                  # whole sheet, 20 km, Overpass
  python3 scripts/ingest_osm.py --lines "Caboolture Line"        # just the Caboolture corridor
  python3 scripts/ingest_osm.py --source geofabrik               # bulk PBF path (fastest, most robust)
  python3 scripts/ingest_osm.py --source file data/fixtures/osm-seq-fixture.osm --db /tmp/test.sqlite
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest import derive, report, sources, store, topology  # noqa: E402
from ingest.scope import build_scope, candidate_index, match_stations  # noqa: E402
from ingest.xlsx import read_scope  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'data/trainsim.sqlite'
DEFAULT_STATIONS = ROOT / 'docs/stations.xlsx'
DEFAULT_CACHE = ROOT / 'data/cache/osm'
# South East Queensland envelope used to look up station names (S, W, N, E).
SEQ_ENVELOPE = (-28.45, 151.80, -25.80, 153.65)

log = sources.log


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--source', choices=['overpass', 'file', 'pbf', 'geofabrik'], default='overpass')
    p.add_argument('inputs', nargs='*', type=Path, help='input files for --source file / pbf')
    p.add_argument('--db', type=Path, default=DEFAULT_DB, help='SQLite database to create or update')
    p.add_argument('--stations', type=Path, default=DEFAULT_STATIONS, help='scope workbook (stations.xlsx)')
    p.add_argument('--lines', help='comma-separated sheet line names to scope to (default: all)')
    p.add_argument('--radius-km', type=float, default=20.0, help='scope buffer around each station')
    p.add_argument('--envelope', help='S,W,N,E box used to locate stations (default: SEQ)')
    p.add_argument('--tile-deg', type=float, default=0.25, help='Overpass tile size in degrees')
    p.add_argument('--endpoint', action='append', help='Overpass endpoint (repeatable)')
    p.add_argument('--cache', type=Path, default=DEFAULT_CACHE, help='raw snapshot cache directory')
    p.add_argument('--refresh', action='store_true', help='ignore cached snapshots and fetch again')
    p.add_argument('--no-prune', action='store_true', help='keep raw OSM rows not seen in this run')
    args = p.parse_args(argv)
    if args.source in ('file', 'pbf') and not args.inputs:
        p.error(f'--source {args.source} needs at least one input file')
    return args


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def main(argv=None):
    args = parse_args(argv)
    t0 = time.time()
    envelope = tuple(float(x) for x in args.envelope.split(',')) if args.envelope else SEQ_ENVELOPE
    sheet = read_scope(args.stations)
    if args.lines:
        wanted = {s.strip().lower() for s in args.lines.split(',')}
        sheet['stations'] = [s for s in sheet['stations'] if (s['line'] or '').lower() in wanted]
        if not sheet['stations']:
            raise SystemExit(f'No stations on lines {args.lines!r}. Lines in the sheet: '
                             + ', '.join(sorted({l["name"] for l in sheet["lines"]})))
    con = store.connect(args.db)
    scope_meta = {'stations_file': str(args.stations), 'lines': args.lines or 'all',
                  'radius_km': args.radius_km, 'envelope': envelope}
    run_id = store.start_run(con, args.source, ' '.join(map(str, args.inputs)) or None, scope_meta)
    snapshots = []

    try:
        store.write_scope(con, sheet)
        con.commit()

        # ---- 1. load / fetch station candidates and the railway elements
        records = None
        if args.source == 'overpass':
            log(f'Locating {len(sheet["stations"])} sheet stations in OSM ...')
            path = sources.cached_overpass(sources.station_query(envelope), args.cache, 'stations', args.refresh, args.endpoint)
            st_elements, raw, meta = sources.parse_overpass_json(path)
            snapshots.append((path.name, raw, len(st_elements), meta))
            index = candidate_index(st_elements)
        else:
            if args.source == 'file':
                files = args.inputs
            else:
                pbf = args.inputs[0] if args.source == 'pbf' else sources.download_geofabrik(args.cache, refresh=args.refresh)
                files = [sources.pbf_to_osm(pbf, envelope, args.cache / 'pbf-work')]
            batches = []
            for f in files:
                elements, raw, meta = sources.parse_file(f)
                snapshots.append((Path(f).name, raw, len(elements), meta))
                batches.append(elements)
            records = sources.merge_elements(batches)
            nodes = {i: (o['lat'], o['lon']) for (t, i), o in records.items() if t == 'node' and 'lat' in o}
            index = candidate_index(records.values(), nodes)

        matches = match_stations(sheet['stations'], index)
        matches.update(store.manual_matches(con))
        store.write_matches(con, matches)
        con.commit()
        scope = build_scope({k: v for k, v in matches.items() if v['status'] == 'matched'}, args.radius_km * 1000)
        matched = sum(1 for m in matches.values() if m['status'] == 'matched')
        log(f'Matched {matched}/{len(sheet["stations"])} sheet stations')
        for name, m in sorted(matches.items()):
            if m['status'] != 'matched':
                log(f'  {m["status"]:<9} {name}: {m.get("note")}')
        if not scope:
            raise RuntimeError('No sheet station could be located in OSM, so the scope is empty')

        if args.source == 'overpass':
            tiles = scope.tiles(args.tile_deg)
            log(f'Fetching railway data for {len(tiles)} tiles of {args.tile_deg} deg ...')
            batches = []
            for k, tile in enumerate(tiles, 1):
                path = sources.cached_overpass(sources.railway_query(tile), args.cache,
                                               f'rail-{tile[0]}_{tile[1]}', args.refresh, args.endpoint)
                elements, raw, meta = sources.parse_overpass_json(path)
                snapshots.append((path.name, raw, len(elements), meta))
                batches.append(elements)
                log(f'  [{k}/{len(tiles)}] {tile}: {len(elements)} elements')
            records = sources.merge_elements(batches)
        elif args.source in ('pbf', 'geofabrik'):
            pass  # already clipped to the envelope; the scope filter below narrows it

        # ---- 2. scope membership
        node_in = {i: scope.contains(o['lat'], o['lon']) for (t, i), o in records.items() if t == 'node' and 'lat' in o}
        way_in = {i: any(node_in.get(n) for n in o.get('nodes', [])) for (t, i), o in records.items() if t == 'way'}
        rel_in = {}
        for (t, i), o in records.items():
            if t == 'relation':
                rel_in[i] = any((m['type'] == 'node' and node_in.get(m['ref'])) or (m['type'] == 'way' and way_in.get(m['ref']))
                                for m in o.get('members', []))

        def in_scope(o):
            return {'node': node_in, 'way': way_in, 'relation': rel_in}[o['type']].get(o['id'], False)

        # ---- 3. one transaction: raw upsert, prune, derive, topology, coverage
        con.execute('BEGIN')
        raw_counts = store.upsert_raw(con, records, run_id, in_scope)
        pruned = {} if args.no_prune else store.prune_raw(con, run_id)
        derived = derive.derive(con)
        topo = topology.build(con)
        for name, raw, n, meta in snapshots:
            store.record_snapshot(con, run_id, sha256(raw), name, len(raw), n, meta.get('osm_timestamp'))
        cov = report.write(con, run_id, topo)
        stats = {'raw': raw_counts, 'pruned': pruned, 'derived': derived, 'topology': topo,
                 'stations_matched': matched, 'stations_total': len(sheet['stations']),
                 'seconds': round(time.time() - t0, 1)}
        store.finish_run(con, run_id, 'ok', stats)  # commits
    except BaseException as exc:
        con.rollback()
        store.finish_run(con, run_id, 'failed', {'error': repr(exc)})
        con.close()
        raise

    con.execute('PRAGMA optimize')
    con.close()
    log(f'\nTrainSim database: {args.db}')
    log(json.dumps({k: v for k, v in stats.items() if k != 'raw'}, indent=2))
    log('Coverage:\n' + report.format_rows(cov))
    log('\nData © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright')
    return stats


if __name__ == '__main__':
    main()
