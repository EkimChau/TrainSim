"""Derive the typed OpenRailwayMap layers (rail_*) from the raw OSM tables.

Derived rows with positive OSM ids are deleted and rebuilt in the caller's
transaction; rows with negative ids (made in the editor) are left alone.
"""
import json
import re

from .geo import haversine, line_length

TRACK_TYPES = {'rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'funicular', 'monorail', 'miniature'}
LIFECYCLE = ('disused', 'abandoned', 'razed', 'construction', 'proposed', 'preserved')
STATION_KINDS = {'station', 'halt', 'tram_stop', 'junction', 'yard', 'crossover', 'spur_junction',
                 'service_station', 'site', 'stop'}
ROUTE_TYPES = {'train', 'railway', 'light_rail', 'subway', 'tram', 'tracks'}
SIGNAL_PRIORITY = ['main', 'combined', 'distant', 'main_repeated', 'minor', 'minor_distant', 'shunting',
                   'crossing', 'crossing_distant', 'speed_limit', 'speed_limit_distant', 'route', 'route_distant',
                   'wrong_road', 'stop', 'stop_demand', 'departure', 'train_protection', 'electricity',
                   'whistle', 'ring', 'humping', 'snowplow', 'resetting_switch', 'switch', 'brake_test']
PROTECTION_KEYS = re.compile(r'^railway:(etcs|ptc|ctcs|lzb|tvm|atc|atp|ats|pzb|atb|kvb|asfa|scmt|ebicab|selcab|'
                             r'zub|aws|tpws|tbl|crocodile|train_protection)(:|$)')
PROTECTION_PRIORITY = ['etcs', 'ptc', 'ctcs', 'lzb', 'tvm', 'atc', 'atp', 'ats', 'pzb', 'atb', 'kvb', 'asfa',
                       'scmt', 'ebicab', 'selcab', 'zub', 'tbl', 'crocodile', 'aws', 'tpws', 'train_protection']
FALSY = {'no', 'none', '0', 'false'}


# ---------------------------------------------------------------- tag parsing
def parse_speed(value):
    if not value:
        return None
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*(mph|km/h|kmh|kph)?\s*$', str(value).split(';')[0], re.I)
    if not m:
        return None
    v = float(m.group(1))
    return round(v * 1.609344, 1) if (m.group(2) or '').lower() == 'mph' else v


def parse_int(value):
    m = re.match(r'^\s*(\d+)', str(value or '').split(';')[0])
    return int(m.group(1)) if m else None


def parse_float(value):
    m = re.match(r'^\s*(\d+(?:\.\d+)?)', str(value or '').split(';')[0])
    return float(m.group(1)) if m else None


def track_kind(tags):
    """(railway type, lifecycle state) or None when the way is not a track."""
    rail = tags.get('railway')
    if rail in TRACK_TYPES:
        state = 'preserved' if tags.get('railway:preserved') == 'yes' else 'present'
        return rail, state
    if rail in LIFECYCLE:
        inner = tags.get(f'{rail}:railway', 'rail')
        return (inner if inner in TRACK_TYPES else 'rail'), rail
    if rail is None:
        for lc in LIFECYCLE:
            inner = tags.get(f'{lc}:railway')
            if inner in TRACK_TYPES:
                return inner, lc
    return None


def train_protection(tags):
    found = {k: v for k, v in tags.items() if PROTECTION_KEYS.match(k)}
    primary = None
    for name in PROTECTION_PRIORITY:
        v = tags.get(f'railway:{name}')
        if v and v.lower() not in FALSY:
            primary = name if v.lower() in ('yes', 'true') else f'{name}:{v}'
            break
    return primary, found


def is_platform(tags):
    if tags.get('railway') == 'platform':
        return True
    return tags.get('public_transport') == 'platform' and any(tags.get(k) == 'yes' for k in ('train', 'light_rail', 'tram', 'subway'))


def feature_kind(tags):
    rail = tags.get('railway')
    if rail and rail not in TRACK_TYPES and rail not in STATION_KINDS and rail not in ('signal', 'switch', 'platform') and rail not in LIFECYCLE:
        return rail
    if rail in LIFECYCLE:
        inner = tags.get(f'{rail}:railway')
        if inner and inner not in TRACK_TYPES:
            return f'{rail}:{inner}'
    if rail is None:
        for lc in LIFECYCLE:
            inner = tags.get(f'{lc}:railway')
            if inner and inner not in TRACK_TYPES:
                return f'{lc}:{inner}'
    if tags.get('public_transport') == 'stop_position' and any(tags.get(k) == 'yes' for k in ('train', 'light_rail', 'tram')):
        return 'stop_position'
    if tags.get('landuse') == 'railway':
        return 'landuse'
    if tags.get('power') == 'substation' and tags.get('substation') == 'traction':
        return 'traction_substation'
    if tags.get('building') == 'train_station':
        return 'station_building'
    return None


# ---------------------------------------------------------------- load raw
def load_raw(con):
    nodes = {r[0]: (r[1], r[2], json.loads(r[3])) for r in con.execute('SELECT id, lat, lon, tags FROM osm_node')}
    way_nodes = {}
    for way_id, node_id in con.execute('SELECT way_id, node_id FROM osm_way_node ORDER BY way_id, seq'):
        way_nodes.setdefault(way_id, []).append(node_id)
    ways = {r[0]: {'tags': json.loads(r[1]), 'in_scope': r[2] or r[0] < 0, 'nodes': way_nodes.get(r[0], [])}
            for r in con.execute('SELECT id, tags, in_scope FROM osm_way')}
    members = {}
    for rel_id, seq, mtype, mid, role in con.execute(
            'SELECT relation_id, seq, member_type, member_id, role FROM osm_relation_member ORDER BY relation_id, seq'):
        members.setdefault(rel_id, []).append((seq, mtype, mid, role))
    rels = {r[0]: {'tags': json.loads(r[1]), 'members': members.get(r[0], [])}
            for r in con.execute('SELECT id, tags FROM osm_relation')}
    node_scope = {r[0]: bool(r[1]) or r[0] < 0 for r in con.execute('SELECT id, in_scope FROM osm_node')}
    return nodes, ways, rels, node_scope


def way_coords(way, nodes):
    return [[nodes[n][1], nodes[n][0]] for n in way['nodes'] if n in nodes]


def centroid(coords):
    if not coords:
        return None
    return (sum(c[1] for c in coords) / len(coords), sum(c[0] for c in coords) / len(coords))


def relation_coords(rel, ways, nodes):
    pts = []
    for _seq, mtype, mid, _role in rel['members']:
        if mtype == 'way' and mid in ways:
            pts.extend(way_coords(ways[mid], nodes))
        elif mtype == 'node' and mid in nodes:
            pts.append([nodes[mid][1], nodes[mid][0]])
    return pts


# ---------------------------------------------------------------- rebuild
def clear_derived(con):
    for t in ('rail_route_member', 'scope_line_route'):
        con.execute(f'DELETE FROM {t} WHERE relation_id > 0')
    con.execute('DELETE FROM rail_route WHERE relation_id > 0')
    con.execute('DELETE FROM rail_route_master WHERE relation_id > 0')
    for t in ('rail_feature', 'rail_platform', 'rail_station'):
        con.execute(f'DELETE FROM {t} WHERE osm_id > 0')
    con.execute('DELETE FROM rail_switch WHERE node_id > 0')
    con.execute('DELETE FROM rail_signal WHERE node_id > 0')
    con.execute('DELETE FROM rail_track WHERE way_id > 0')
    con.execute('DELETE FROM rtree_track WHERE way_id > 0')


def derive(con):
    nodes, ways, rels, node_scope = load_raw(con)
    clear_derived(con)
    counts = {}

    # Tracks
    rows = []
    for wid, way in ways.items():
        if wid < 0 or not way['in_scope']:
            continue
        kind = track_kind(way['tags'])
        if not kind:
            continue
        coords = way_coords(way, nodes)
        if len(coords) < 2:
            continue
        t = way['tags']
        primary, prot = train_protection(t)
        lats, lons = [c[1] for c in coords], [c[0] for c in coords]
        rows.append((wid, kind[0], kind[1], t.get('usage'), t.get('service'), t.get('ref'), t.get('name'),
                     t.get('operator'), t.get('owner'), t.get('railway:track_ref'), t.get('gauge'), parse_int(t.get('gauge')),
                     t.get('electrified'), parse_int(t.get('voltage')), parse_float(t.get('frequency')),
                     parse_speed(t.get('maxspeed')), parse_speed(t.get('maxspeed:forward')), parse_speed(t.get('maxspeed:backward')),
                     t.get('railway:preferred_direction'), primary, json.dumps(prot, sort_keys=True),
                     int(t.get('tunnel', 'no') not in FALSY), int(t.get('bridge', 'no') not in FALSY), parse_int(t.get('layer')),
                     round(line_length(coords), 2), json.dumps(coords, separators=(',', ':')),
                     min(lats), min(lons), max(lats), max(lons)))
    con.executemany(f'INSERT INTO rail_track VALUES ({",".join("?" * 30)})', rows)
    con.executemany('INSERT INTO rtree_track(way_id, min_lat, max_lat, min_lon, max_lon) VALUES (?,?,?,?,?)',
                    [(r[0], r[26], r[28], r[27], r[29]) for r in rows])
    counts['rail_track'] = len(rows)

    # Point / area objects from nodes, ways and relations
    stations, platforms, signals, switches, features = [], [], [], [], []

    def geometry(otype, oid):
        if otype == 'node':
            lat, lon, _ = nodes[oid]
            return lat, lon, None
        coords = way_coords(ways[oid], nodes) if otype == 'way' else relation_coords(rels[oid], ways, nodes)
        c = centroid(coords)
        if not c:
            return None
        return c[0], c[1], json.dumps(coords, separators=(',', ':')) if otype == 'way' else None

    def objects():
        for nid, (lat, lon, tags) in nodes.items():
            if tags and nid > 0 and node_scope.get(nid):
                yield 'node', nid, tags
        for wid, way in ways.items():
            if way['tags'] and wid > 0 and way['in_scope'] and not track_kind(way['tags']):
                yield 'way', wid, way['tags']
        for rid, rel in rels.items():
            if rid > 0 and rel['tags'].get('type') in ('multipolygon', 'public_transport', 'site') or (rid > 0 and rel['tags'].get('railway')):
                yield 'relation', rid, rel['tags']

    for otype, oid, t in objects():
        rail = t.get('railway')
        if otype == 'relation' and t.get('public_transport') == 'stop_area':
            continue
        g = geometry(otype, oid)
        if not g:
            continue
        lat, lon, coords = g
        if rail in STATION_KINDS and t.get('disused') != 'yes':
            stations.append((otype, oid, rail, t.get('name'), t.get('railway:ref') or t.get('ref'), t.get('uic_ref'),
                             t.get('operator'), t.get('network'), t.get('public_transport'), lat, lon))
        elif is_platform(t):
            platforms.append([otype, oid, t.get('ref') or t.get('local_ref') or t.get('railway:track_ref'), t.get('name'),
                              parse_float(t.get('height')), parse_float(t.get('length')), None, None, lat, lon, coords])
        elif otype == 'node' and rail == 'signal':
            cats = {k: v for k, v in t.items() if k.startswith('railway:signal:')}
            present = [k.split(':')[2] for k in cats if k.count(':') == 2 and k.split(':')[2] not in ('direction', 'position')]
            category = next((c for c in SIGNAL_PRIORITY if c in present), present[0] if present else None)
            deactivated = int(any(k.endswith(':deactivated') and v == 'yes' for k, v in cats.items()))
            direction = t.get('railway:signal:direction')
            signals.append((oid, t.get('ref'), category, json.dumps(cats, sort_keys=True),
                            direction if direction in ('forward', 'backward', 'both') else None,
                            t.get('railway:signal:position'), t.get('railway:position:exact') or t.get('railway:position'),
                            deactivated, lat, lon))
        elif otype == 'node' and rail == 'switch':
            switches.append((oid, t.get('ref'), t.get('railway:switch'), t.get('railway:turnout_side'),
                             t.get('railway:switch:electric'), t.get('railway:switch:heated'), t.get('railway:local_operated'),
                             t.get('railway:switch:resetting'),
                             parse_speed(t.get('railway:maxspeed:straight') or t.get('railway:switch:maxspeed:straight')),
                             parse_speed(t.get('railway:maxspeed:diverging') or t.get('railway:switch:maxspeed:diverging')),
                             lat, lon))
        else:
            kind = feature_kind(t)
            if kind:
                features.append((otype, oid, kind, t.get('ref') or t.get('railway:ref'), t.get('name'),
                                 t.get('railway:position:exact') or t.get('railway:position'), lat, lon, coords))

    # Link platforms to stations: stop_area relation membership first, then nearest station <= 500 m.
    station_keys = {(s[0], s[1]): s for s in stations}
    platform_station = {}
    for rid, rel in rels.items():
        if rel['tags'].get('public_transport') != 'stop_area':
            continue
        mem = [(m[1], m[2]) for m in rel['members']]
        st = next((m for m in mem if m in station_keys), None)
        if st:
            for m in mem:
                platform_station.setdefault(m, st)
    for p in platforms:
        st = platform_station.get((p[0], p[1]))
        if not st:
            best = min(((haversine(p[8], p[9], s[9], s[10]), (s[0], s[1])) for s in stations
                        if s[2] in ('station', 'halt', 'tram_stop')), default=(None, None))
            st = best[1] if best[0] is not None and best[0] <= 500 else None
        if st:
            p[6], p[7] = st

    con.executemany('INSERT INTO rail_station VALUES (?,?,?,?,?,?,?,?,?,?,?)', stations)
    con.executemany('INSERT INTO rail_platform VALUES (?,?,?,?,?,?,?,?,?,?,?)', [tuple(p) for p in platforms])
    con.executemany('INSERT INTO rail_signal VALUES (?,?,?,?,?,?,?,?,?,?)', signals)
    con.executemany('INSERT INTO rail_switch VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', switches)
    con.executemany('INSERT INTO rail_feature VALUES (?,?,?,?,?,?,?,?,?)', features)
    counts.update(rail_station=len(stations), rail_platform=len(platforms), rail_signal=len(signals),
                  rail_switch=len(switches), rail_feature=len(features))

    counts.update(derive_routes(con, nodes, ways, rels))
    return counts


# ---------------------------------------------------------------- routes
def chain_route(way_ids, ways, nodes):
    """Chain ordered route ways into continuous node paths. Returns (segments, missing_ways)."""
    segments, cur, missing = [], None, 0
    for wid in way_ids:
        way = ways.get(wid)
        if not way or len(way['nodes']) < 2 or any(n not in nodes for n in way['nodes']):
            missing += 1
            if cur:
                segments.append(cur)
            cur = None
            continue
        seq = list(way['nodes'])
        if cur is None:
            cur = seq
            continue
        if cur[-1] == seq[0]:
            cur.extend(seq[1:])
        elif cur[-1] == seq[-1]:
            cur.extend(reversed(seq[:-1]))
        elif len(segments) == 0 and cur[0] in (seq[0], seq[-1]) and cur.count(cur[0]) == 1:
            cur.reverse()
            cur.extend(seq[1:] if cur[-1] == seq[0] else list(reversed(seq[:-1])))
        else:
            segments.append(cur)
            cur = seq
    if cur:
        segments.append(cur)
    return segments, missing


def derive_routes(con, nodes, ways, rels):
    masters, routes, members = [], [], []
    master_of = {}
    for rid, rel in rels.items():
        t = rel['tags']
        if rid > 0 and t.get('type') == 'route_master' and t.get('route_master') in ROUTE_TYPES:
            masters.append((rid, t.get('route_master'), t.get('ref'), t.get('name'), t.get('network'),
                            t.get('operator'), t.get('colour')))
            for _seq, mtype, mid, _role in rel['members']:
                if mtype == 'relation':
                    master_of[mid] = rid
    for rid, rel in rels.items():
        t = rel['tags']
        if rid < 0 or t.get('type') != 'route' or t.get('route') not in ROUTE_TYPES:
            continue
        mem = rel['members']
        way_ids = [mid for _s, mtype, mid, role in mem if mtype == 'way' and not role.startswith(('platform', 'stop'))]
        stops = [m for m in mem if m[3].startswith('stop')]
        segments, missing = chain_route(way_ids, ways, nodes)
        coords = [[[nodes[n][1], nodes[n][0]] for n in seg] for seg in segments]
        length = sum(line_length(c) for c in coords)
        status = 'none' if not coords else ('ok' if len(coords) == 1 and missing == 0 else 'gaps')
        routes.append((rid, t.get('route'), t.get('ref'), t.get('name'), t.get('from'), t.get('to'), t.get('network'),
                       t.get('operator'), t.get('colour'), master_of.get(rid), len(mem), len(way_ids), len(stops),
                       status, max(0, len(coords) - 1) + missing, round(length, 1) if coords else None,
                       json.dumps(coords, separators=(',', ':')) if coords else None))
        members.extend((rid, seq, mtype, mid, role) for seq, mtype, mid, role in mem)
    con.executemany('INSERT INTO rail_route_master VALUES (?,?,?,?,?,?,?)', masters)
    con.executemany(f'INSERT INTO rail_route VALUES ({",".join("?" * 17)})', routes)
    con.executemany('INSERT INTO rail_route_member VALUES (?,?,?,?,?)', members)

    # Map sheet lines to OSM routes by name ("Beenleigh / Gold Coast Line" -> beenleigh, goldcoast).
    from .scope import normalise
    links = []
    for line_id, name in con.execute('SELECT line_id, name FROM scope_line'):
        tokens = [normalise(re.sub(r'(?i)\bline\b', '', part)) for part in name.split('/')]
        tokens = [tok for tok in tokens if tok and tok != 'busway']
        for r in routes:
            label = normalise(' '.join(filter(None, [r[3], r[2], r[4], r[5]])))
            if any(tok in label for tok in tokens):
                links.append((line_id, r[0]))
    con.executemany('INSERT OR IGNORE INTO scope_line_route VALUES (?,?)', links)
    return {'rail_route': len(routes), 'rail_route_master': len(masters), 'scope_line_route': len(links)}
