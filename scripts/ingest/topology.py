"""Build the simulator track graph from rail_track + osm_way_node.

  topo_node          split points: switches, crossings, junctions, ends, way joins
  topo_edge          track pieces between split points, in way-node order
  topo_switch_leg    legal trunk -> branch moves at three-way nodes (straight / diverging)
  topo_edge_feature  signals, switches, milestones, crossings, platforms and stations
                     placed along edges with offset (m) and facing direction
"""
import json
from collections import defaultdict

from .geo import angle_between, bearing, haversine, project_point_on_segment

NODE_KINDS_FROM_TAGS = {'switch': 'switch', 'railway_crossing': 'crossing', 'buffer_stop': 'buffer_stop'}


def clear(con):
    for t in ('topo_edge_feature', 'topo_switch_leg', 'topo_edge', 'topo_node', 'rtree_edge'):
        con.execute(f'DELETE FROM {t}')


def build(con):
    clear(con)
    way_nodes = defaultdict(list)
    for way_id, node_id in con.execute('''SELECT wn.way_id, wn.node_id FROM osm_way_node wn
                                          JOIN rail_track t ON t.way_id = wn.way_id
                                          WHERE t.state IN ('present','preserved') ORDER BY wn.way_id, wn.seq'''):
        way_nodes[way_id].append(node_id)
    pos = {}
    tags = {}
    for nid, lat, lon, tg in con.execute('''SELECT DISTINCT n.id, n.lat, n.lon, n.tags FROM osm_node n
            JOIN osm_way_node wn ON wn.node_id = n.id JOIN rail_track t ON t.way_id = wn.way_id
            WHERE t.state IN ('present','preserved')'''):
        pos[nid] = (lat, lon)
        if tg != '{}':
            tags[nid] = json.loads(tg)
    usage = defaultdict(int)
    for nodes in way_nodes.values():
        for n in set(nodes):
            usage[n] += 1
        if nodes and nodes[0] == nodes[-1]:
            usage[nodes[0]] += 1  # closed loop: treat the join as a split point

    def is_split(n):
        return usage[n] > 1 or (tags.get(n, {}).get('railway') in NODE_KINDS_FROM_TAGS)

    edges = []  # (way_id, seq_from, seq_to, from_node, to_node, length, coords)
    for way_id, nodes in way_nodes.items():
        if len(nodes) < 2 or any(n not in pos for n in nodes):
            continue
        start = 0
        for i in range(1, len(nodes)):
            if i == len(nodes) - 1 or is_split(nodes[i]):
                seg = nodes[start:i + 1]
                coords = [[pos[n][1], pos[n][0]] for n in seg]
                length = sum(haversine(a[1], a[0], b[1], b[0]) for a, b in zip(coords, coords[1:]))
                edges.append((way_id, start, i, seg[0], seg[-1], round(length, 2), coords))
                start = i

    degree = defaultdict(int)
    for e in edges:
        degree[e[3]] += 1
        degree[e[4]] += 1
    node_rows = []
    for n, d in degree.items():
        tagged = NODE_KINDS_FROM_TAGS.get(tags.get(n, {}).get('railway'))
        if tagged:
            kind = tagged
        elif d == 1:
            kind = 'end'
        elif d >= 3:
            kind = 'junction'
        else:
            kind = 'split'
        node_rows.append((n, kind, d, pos[n][0], pos[n][1]))
    con.executemany('INSERT INTO topo_node VALUES (?,?,?,?,?)', node_rows)
    edge_ids = {}
    for e in edges:
        cur = con.execute('INSERT INTO topo_edge(way_id, seq_from, seq_to, from_node, to_node, length_m, coords) VALUES (?,?,?,?,?,?,?)',
                          (*e[:6], json.dumps(e[6], separators=(',', ':'))))
        edge_ids[(e[0], e[1])] = cur.lastrowid
        lats, lons = [c[1] for c in e[6]], [c[0] for c in e[6]]
        con.execute('INSERT INTO rtree_edge VALUES (?,?,?,?,?)', (cur.lastrowid, min(lats), max(lats), min(lons), max(lons)))

    legs = switch_legs(con, edges, edge_ids, node_rows)
    feats = edge_features(con, edges, edge_ids, way_nodes, pos)
    return {'topo_node': len(node_rows), 'topo_edge': len(edges), 'topo_switch_leg': legs,
            'topo_edge_feature': feats, 'components': components(edges)}


def _leaving_bearing(edge, node):
    """Bearing of an edge as it leaves `node` (uses the adjacent vertex)."""
    coords = edge[6]
    if edge[3] == node:
        a, b = coords[0], coords[1]
    else:
        a, b = coords[-1], coords[-2]
    return bearing(a[1], a[0], b[1], b[0])


def switch_legs(con, edges, edge_ids, node_rows):
    incident = defaultdict(list)
    for e in edges:
        incident[e[3]].append(e)
        incident[e[4]].append(e)
    rows = []
    for n, kind, d, _lat, _lon in node_rows:
        if kind not in ('switch', 'junction') or d != 3:
            continue
        es = incident[n]
        bs = [_leaving_bearing(e, n) for e in es]
        pairs = [(angle_between(bs[i], bs[j]), i, j) for i in range(3) for j in range(i + 1, 3)]
        spread, i, j = min(pairs)  # the two branches leave in nearly the same direction
        trunk = ({0, 1, 2} - {i, j}).pop()
        dev_i = abs(180 - angle_between(bs[trunk], bs[i]))
        dev_j = abs(180 - angle_between(bs[trunk], bs[j]))
        straight, diverging = (i, j) if dev_i <= dev_j else (j, i)
        t_id = edge_ids[(es[trunk][0], es[trunk][1])]
        rows.append((n, t_id, edge_ids[(es[straight][0], es[straight][1])], 'straight', round(min(dev_i, dev_j), 1)))
        rows.append((n, t_id, edge_ids[(es[diverging][0], es[diverging][1])], 'diverging', round(spread, 1)))
    con.executemany('INSERT OR IGNORE INTO topo_switch_leg VALUES (?,?,?,?,?)', rows)
    return len(rows)


def edge_features(con, edges, edge_ids, way_nodes, pos):
    # node_id -> (edge_id, offset_m) for every vertex of every edge; first edge wins at shared ends.
    at_node = {}
    for e in edges:
        eid = edge_ids[(e[0], e[1])]
        seg = way_nodes[e[0]][e[1]:e[2] + 1]
        off = 0.0
        for k, n in enumerate(seg):
            if k:
                a, b = pos[seg[k - 1]], pos[n]
                off += haversine(a[0], a[1], b[0], b[1])
            if n not in at_node or 0 < k < len(seg) - 1:
                at_node[n] = (eid, round(off, 2))
    rows = []
    on_track = [
        ('signal', 'SELECT node_id, direction, lat, lon FROM rail_signal'),
        ('switch', "SELECT node_id, NULL, lat, lon FROM rail_switch"),
    ]
    for kind, sql in on_track:
        for nid, direction, lat, lon in con.execute(sql):
            hit = at_node.get(nid)
            if hit:
                rows.append((hit[0], kind, 'node', nid, hit[1], 0.0, direction))
            else:
                snap = _snap(con, lat, lon, 30)
                if snap:
                    rows.append((snap[0], kind, 'node', nid, snap[1], snap[2], direction))
    for otype, oid, kind, lat, lon in con.execute(
            "SELECT osm_type, osm_id, kind, lat, lon FROM rail_feature WHERE kind NOT IN ('landuse','station_building','traction_substation','site')"):
        hit = at_node.get(oid) if otype == 'node' else None
        if hit:
            rows.append((hit[0], kind, otype, oid, hit[1], 0.0, None))
        else:
            snap = _snap(con, lat, lon, 50)
            if snap:
                rows.append((snap[0], kind, otype, oid, snap[1], snap[2], None))
    for table, kind, limit in (('rail_platform', 'platform', 60), ('rail_station', 'station', 300)):
        for otype, oid, lat, lon in con.execute(f'SELECT osm_type, osm_id, lat, lon FROM {table}'):
            snap = _snap(con, lat, lon, limit)
            if snap:
                rows.append((snap[0], kind, otype, oid, snap[1], snap[2], None))
    con.executemany('INSERT OR IGNORE INTO topo_edge_feature VALUES (?,?,?,?,?,?,?)', rows)
    return len(rows)


def _snap(con, lat, lon, max_m):
    """Nearest edge within max_m: (edge_id, offset_m, distance_m)."""
    d = max_m / 100000.0 + 0.0005
    best = None
    for eid, coords, in con.execute('''SELECT e.edge_id, e.coords FROM rtree_edge r JOIN topo_edge e ON e.edge_id = r.edge_id
                                       WHERE r.max_lat >= ? AND r.min_lat <= ? AND r.max_lon >= ? AND r.min_lon <= ?''',
                                    (lat - d, lat + d, lon - d, lon + d)):
        pts = json.loads(coords)
        off = 0.0
        for a, b in zip(pts, pts[1:]):
            seg = haversine(a[1], a[0], b[1], b[0])
            t, dist = project_point_on_segment(lat, lon, a, b)
            if dist <= max_m and (best is None or dist < best[2]):
                best = (eid, round(off + t * seg, 2), round(dist, 2))
            off += seg
    return best


def components(edges):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in edges:
        a, b = find(e[3]), find(e[4])
        if a != b:
            parent[a] = b
    return len({find(n) for n in parent})
