"""Measured completeness: what fraction of each layer carries the attributes a simulator needs."""

MAIN = "state='present' AND railway IN ('rail','narrow_gauge','light_rail','subway') AND (service IS NULL)"

METRICS = [
    # metric, numerator SQL, denominator SQL, note
    ('scope_stations_matched', "SELECT count(*) FROM scope_station WHERE match_status IN ('matched','manual')",
     'SELECT count(*) FROM scope_station', 'sheet stations located in OSM'),
    ('tracks_present', "SELECT count(*) FROM rail_track WHERE state='present'", None, 'track ways in scope'),
    ('track_km_present', "SELECT CAST(round(coalesce(sum(length_m),0)/1000) AS INTEGER) FROM rail_track WHERE state='present'", None, 'km of present track'),
    ('main_tracks_with_maxspeed', f'SELECT count(*) FROM rail_track WHERE {MAIN} AND coalesce(maxspeed, maxspeed_forward, maxspeed_backward) IS NOT NULL',
     f'SELECT count(*) FROM rail_track WHERE {MAIN}', 'running lines with a speed limit'),
    ('main_tracks_with_gauge', f'SELECT count(*) FROM rail_track WHERE {MAIN} AND gauge_mm IS NOT NULL',
     f'SELECT count(*) FROM rail_track WHERE {MAIN}', None),
    ('main_tracks_with_electrification', f'SELECT count(*) FROM rail_track WHERE {MAIN} AND electrified IS NOT NULL',
     f'SELECT count(*) FROM rail_track WHERE {MAIN}', 'electrified=* tagged (yes or no)'),
    ('main_tracks_with_train_protection', f'SELECT count(*) FROM rail_track WHERE {MAIN} AND train_protection_json <> \'{{}}\'',
     f'SELECT count(*) FROM rail_track WHERE {MAIN}', 'any railway:<system> key'),
    ('main_tracks_with_line_ref', f'SELECT count(*) FROM rail_track WHERE {MAIN} AND ref IS NOT NULL',
     f'SELECT count(*) FROM rail_track WHERE {MAIN}', None),
    ('signals', 'SELECT count(*) FROM rail_signal', None, None),
    ('signals_with_direction', 'SELECT count(*) FROM rail_signal WHERE direction IS NOT NULL', 'SELECT count(*) FROM rail_signal', None),
    ('signals_with_category', 'SELECT count(*) FROM rail_signal WHERE category IS NOT NULL', 'SELECT count(*) FROM rail_signal', None),
    ('signals_on_track', "SELECT count(DISTINCT osm_id) FROM topo_edge_feature WHERE feature_kind='signal' AND snap_m = 0",
     'SELECT count(*) FROM rail_signal', 'signal node is a track vertex'),
    ('switches_tagged', 'SELECT count(*) FROM rail_switch', None, 'railway=switch nodes'),
    ('switches_with_ref', 'SELECT count(*) FROM rail_switch WHERE ref IS NOT NULL', 'SELECT count(*) FROM rail_switch', None),
    ('junctions_untagged', "SELECT count(*) FROM topo_node WHERE kind='junction'", "SELECT count(*) FROM topo_node WHERE kind IN ('junction','switch')",
     'degree>=3 track nodes without railway=switch'),
    ('switch_legs_resolved', "SELECT count(DISTINCT switch_node) FROM topo_switch_leg",
     "SELECT count(*) FROM topo_node WHERE kind IN ('junction','switch') AND degree=3", None),
    ('platforms', 'SELECT count(*) FROM rail_platform', None, None),
    ('platforms_with_ref', 'SELECT count(*) FROM rail_platform WHERE ref IS NOT NULL', 'SELECT count(*) FROM rail_platform', None),
    ('platforms_linked_to_station', 'SELECT count(*) FROM rail_platform WHERE station_osm_id IS NOT NULL', 'SELECT count(*) FROM rail_platform', None),
    ('milestones', "SELECT count(*) FROM rail_feature WHERE kind='milestone'", None, None),
    ('level_crossings', "SELECT count(*) FROM rail_feature WHERE kind IN ('level_crossing','crossing')", None, None),
    ('routes', 'SELECT count(*) FROM rail_route', None, None),
    ('routes_path_complete', "SELECT count(*) FROM rail_route WHERE path_status='ok'", 'SELECT count(*) FROM rail_route',
     'routes reaching outside the scope show gaps by design'),
    ('sheet_lines_with_routes', 'SELECT count(DISTINCT line_id) FROM scope_line_route', "SELECT count(*) FROM scope_line WHERE name <> 'Busway'", None),
    ('way_nodes_missing', 'SELECT count(*) FROM osm_way_node wn LEFT JOIN osm_node n ON n.id = wn.node_id WHERE n.id IS NULL',
     'SELECT count(*) FROM osm_way_node', 'should be 0'),
    ('graph_components', None, None, 'connected track networks (1 is ideal; yards/trams add more)'),
]


def write(con, run_id, extra):
    rows = []
    for metric, num, den, note in METRICS:
        if metric == 'graph_components':
            n, d = extra.get('components', 0), None
        else:
            n = con.execute(num).fetchone()[0]
            d = con.execute(den).fetchone()[0] if den else None
        rows.append((run_id, metric, n, d, note))
    con.executemany('INSERT OR REPLACE INTO coverage VALUES (?,?,?,?,?)', rows)
    return rows


def format_rows(rows):
    out = []
    for _run, metric, n, d, _note in rows:
        pct = f' ({100.0 * n / d:5.1f}%)' if d else ''
        out.append(f'  {metric:<36} {n:>8}{" / " + str(d) if d is not None else ""}{pct}')
    return '\n'.join(out)
