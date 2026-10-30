"""SQLite storage: schema, idempotent raw upserts, pruning and scope tables."""
import datetime as dt
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'db/corpus/geography-schema.sql'


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds')


def connect(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('PRAGMA synchronous=NORMAL')
    con.execute('PRAGMA foreign_keys=ON')
    con.executescript(SCHEMA.read_text())
    return con


def start_run(con, source, detail, scope):
    cur = con.execute('INSERT INTO ingest_run(started_at, source, source_detail, scope_json, status) VALUES (?,?,?,?,?)',
                      (now(), source, detail, json.dumps(scope), 'running'))
    con.commit()
    return cur.lastrowid


def finish_run(con, run_id, status, stats):
    con.execute('UPDATE ingest_run SET finished_at=?, status=?, stats_json=? WHERE run_id=?',
                (now(), status, json.dumps(stats), run_id))
    con.commit()


def record_snapshot(con, run_id, sha, name, size, elements, osm_timestamp):
    con.execute('''INSERT INTO source_snapshot(sha256, name, bytes, elements, osm_timestamp, first_run_id, last_run_id)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT(sha256) DO UPDATE SET last_run_id = excluded.last_run_id''',
                (sha, name, size, elements, osm_timestamp, run_id, run_id))


# ---------------------------------------------------------------- scope (sheet)
def write_scope(con, scope):
    """Upsert sheet lines/stations by natural key; stations removed from the sheet are deleted."""
    for line in scope['lines']:
        con.execute('''INSERT INTO scope_line(name, colour, start_station, end_station) VALUES (?,?,?,?)
                       ON CONFLICT(name) DO UPDATE SET colour=excluded.colour, start_station=excluded.start_station,
                       end_station=excluded.end_station''',
                    (line['name'], line['colour'], line['start_station'], line['end_station']))
    line_ids = dict(con.execute('SELECT name, line_id FROM scope_line'))
    for st in scope['stations']:
        con.execute('''INSERT INTO scope_station(name, line_id, line_seq, zone, wheelchair, assisted_wheelchair)
                       VALUES (?,?,?,?,?,?)
                       ON CONFLICT(name) DO UPDATE SET line_id=excluded.line_id, line_seq=excluded.line_seq,
                       zone=excluded.zone, wheelchair=excluded.wheelchair, assisted_wheelchair=excluded.assisted_wheelchair''',
                    (st['name'], line_ids.get(st['line']), st['line_seq'], st['zone'], st['wheelchair'], st['assisted_wheelchair']))
    names = [s['name'] for s in scope['stations']]
    con.execute(f'DELETE FROM scope_station WHERE name NOT IN ({",".join("?" * len(names))})', names)
    lines = [l['name'] for l in scope['lines']]
    con.execute(f'DELETE FROM scope_line WHERE name NOT IN ({",".join("?" * len(lines))})', lines)
    station_ids = dict(con.execute('SELECT name, station_id FROM scope_station'))
    con.execute('DELETE FROM scope_connection')
    for c in scope['connections']:
        if c['station'] in station_ids:
            con.execute('INSERT INTO scope_connection(station_id, connections) VALUES (?,?)',
                        (station_ids[c['station']], c['connections']))
    for f in scope['facilities']:
        con.execute('INSERT INTO scope_facility(name, description) VALUES (?,?) '
                    'ON CONFLICT(name) DO UPDATE SET description=excluded.description', (f['name'], f['description']))


def write_matches(con, matches):
    """Store OSM matches. Rows set to match_status='manual' in the editor are kept as-is."""
    for name, m in matches.items():
        con.execute('''UPDATE scope_station SET lat=?, lon=?, osm_type=?, osm_id=?, match_status=?, match_note=?
                       WHERE name=? AND match_status <> 'manual' ''',
                    (m.get('lat'), m.get('lon'), m.get('osm_type'), m.get('osm_id'), m['status'], m.get('note'), name))


def manual_matches(con):
    return {r[0]: {'status': 'matched', 'lat': r[1], 'lon': r[2], 'osm_type': r[3], 'osm_id': r[4], 'note': 'manual'}
            for r in con.execute("SELECT name, lat, lon, osm_type, osm_id FROM scope_station "
                                 "WHERE match_status='manual' AND lat IS NOT NULL AND lon IS NOT NULL")}


# ---------------------------------------------------------------- raw OSM upsert
def upsert_raw(con, records, run_id, in_scope):
    """Upsert every element by OSM id. A row is only overwritten when the incoming
    version is the same or newer, so stale snapshots cannot roll data back."""
    nodes = [(o['id'], o['lat'], o['lon'], o.get('version') or 0, o.get('timestamp'), o.get('changeset'), o.get('user'),
              json.dumps(o.get('tags') or {}, sort_keys=True, ensure_ascii=False), int(in_scope(o)), run_id)
             for (t, _), o in records.items() if t == 'node' and 'lat' in o]
    con.executemany('''INSERT INTO osm_node(id, lat, lon, version, timestamp, changeset, user, tags, in_scope, last_seen_run)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          lat=CASE WHEN excluded.version>=osm_node.version THEN excluded.lat ELSE osm_node.lat END,
          lon=CASE WHEN excluded.version>=osm_node.version THEN excluded.lon ELSE osm_node.lon END,
          tags=CASE WHEN excluded.version>=osm_node.version THEN excluded.tags ELSE osm_node.tags END,
          timestamp=CASE WHEN excluded.version>=osm_node.version THEN excluded.timestamp ELSE osm_node.timestamp END,
          changeset=CASE WHEN excluded.version>=osm_node.version THEN excluded.changeset ELSE osm_node.changeset END,
          user=CASE WHEN excluded.version>=osm_node.version THEN excluded.user ELSE osm_node.user END,
          version=max(excluded.version, osm_node.version),
          in_scope=excluded.in_scope, last_seen_run=excluded.last_seen_run''', nodes)

    for kind, table in (('way', 'osm_way'), ('relation', 'osm_relation')):
        rows = [(o['id'], o.get('version') or 0, o.get('timestamp'), o.get('changeset'), o.get('user'),
                 json.dumps(o.get('tags') or {}, sort_keys=True, ensure_ascii=False), int(in_scope(o)), run_id)
                for (t, _), o in records.items() if t == kind]
        changed = []
        for row in rows:
            old = con.execute(f'SELECT version FROM {table} WHERE id=?', (row[0],)).fetchone()
            if old is None or row[1] >= old[0]:
                changed.append(row[0])
        con.executemany(f'''INSERT INTO {table}(id, version, timestamp, changeset, user, tags, in_scope, last_seen_run)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              tags=CASE WHEN excluded.version>={table}.version THEN excluded.tags ELSE {table}.tags END,
              timestamp=CASE WHEN excluded.version>={table}.version THEN excluded.timestamp ELSE {table}.timestamp END,
              changeset=CASE WHEN excluded.version>={table}.version THEN excluded.changeset ELSE {table}.changeset END,
              user=CASE WHEN excluded.version>={table}.version THEN excluded.user ELSE {table}.user END,
              version=max(excluded.version, {table}.version),
              in_scope=excluded.in_scope, last_seen_run=excluded.last_seen_run''', rows)
        # Ordered children (way nodes / relation members) are replaced wholesale for changed parents.
        if kind == 'way':
            con.executemany('DELETE FROM osm_way_node WHERE way_id=?', [(i,) for i in changed])
            con.executemany('INSERT INTO osm_way_node(way_id, seq, node_id) VALUES (?,?,?)',
                            [(i, seq, n) for i in changed for seq, n in enumerate(records[('way', i)].get('nodes', []))])
        else:
            con.executemany('DELETE FROM osm_relation_member WHERE relation_id=?', [(i,) for i in changed])
            con.executemany('INSERT INTO osm_relation_member(relation_id, seq, member_type, member_id, role) VALUES (?,?,?,?,?)',
                            [(i, seq, m['type'], m['ref'], m.get('role') or '')
                             for i in changed for seq, m in enumerate(records[('relation', i)].get('members', []))])
    return {'nodes': len(nodes), 'ways': sum(1 for k in records if k[0] == 'way'),
            'relations': sum(1 for k in records if k[0] == 'relation')}


def prune_raw(con, run_id):
    """Remove OSM elements that no longer exist in the scope (deleted upstream or scope shrank).
    Hand-made rows (negative ids) are never touched."""
    out = {}
    for table in ('osm_relation', 'osm_way', 'osm_node'):
        cur = con.execute(f'DELETE FROM {table} WHERE id > 0 AND (last_seen_run IS NULL OR last_seen_run <> ?)', (run_id,))
        out[table] = cur.rowcount
    return out
