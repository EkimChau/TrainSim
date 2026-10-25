# Ingestion and data model

`scripts/ingest_osm.py` builds `data/trainsim.sqlite` from OpenStreetMap. It uses the
Python standard library only (osmium-tool is needed just for the PBF sources).

## Scope

1. **Stations** come from [`docs/stations.xlsx`](stations.xlsx): 143 stations on 13 lines
   (sheet tabs `stations`, `line_start_end`, `connections`, `facilities`, `line_colors`).
   The sheet was transcribed from the 2012 TransLink network map kept at
   [`data/reference/translink-network-map-2012.png`](../data/reference/translink-network-map-2012.png).
   `--lines "Caboolture Line"` narrows the scope to chosen lines.
2. **Locating stations.** The sheet has no coordinates, so every name is matched to an OSM
   station (`railway=station|halt`, `public_transport=station`, or `amenity=bus_station`
   for the three busway stations). Spelling differences are handled by aliases
   (`Glasshouse Mtns` → Glass House Mountains, `Coarparoo` → Coorparoo, `Airport
   (Domestic)` → Domestic Airport, ...). Same-name places far apart are resolved by
   distance to the other stations on the same line; anything still unclear is stored as
   `ambiguous` or `unmatched` with a note. To fix one by hand, set `lat`, `lon`
   (and optionally `osm_type`/`osm_id`) and `match_status='manual'` on its
   `scope_station` row in the Data page. Manual rows are kept on every re-run.
3. **Area.** The scope is the union of 20 km circles (`--radius-km`) around the located
   stations. A way is in scope when any of its nodes is; it is stored whole so geometry
   never gets cut.

## Sources

| `--source` | How | When |
|---|---|---|
| `overpass` (default) | Phase 1: one station query over SEQ. Phase 2: the scope split into 0.25° tiles, one railway query per tile (`railway`, lifecycle `*:railway`, train/tram stop positions and platforms, route relations and route masters, railway landuse, traction substations, station buildings), with every way node. Raw responses are cached in `data/cache/osm/` keyed by the query hash, so an interrupted run resumes and re-runs are offline. Back-off on 429/504, two endpoints, `remark` errors treated as failures. | Any machine with Python. First full run takes a while; Overpass asks for fair use. |
| `geofabrik` | Downloads `queensland-latest.osm.pbf` (md5 checked), clips it to the SEQ envelope with `osmium extract -s smart` (complete ways and relations) and keeps railway tags with `osmium tags-filter`. | Fastest and most robust full refresh. `brew install osmium-tool` / `apt install osmium-tool`. |
| `pbf FILE` | Same as above with a PBF you already have. | Offline / custom extracts. |
| `file FILE...` | Overpass JSON or OSM XML (`.osm`, `.osm.gz`). | Tests, JOSM exports. |

All sources produce identical tables.

## Pipeline (one transaction per run)

1. **Scope tables** upserted from the workbook by natural key (station name, line name).
2. **Raw upsert**: `osm_node`, `osm_way` (+ ordered `osm_way_node`), `osm_relation`
   (+ ordered `osm_relation_member`) keyed by OSM id; an older version never overwrites
   a newer one. Elements not seen in this run are **pruned** (`--no-prune` to keep them).
3. **Typed layers** (`rail_*`) rebuilt from raw: tracks, stations/operating points,
   platforms (linked to their station by `stop_area` relation, else nearest ≤ 500 m),
   signals, switches, other railway features, routes and route masters. Sheet lines are
   linked to OSM routes by name in `scope_line_route`.
4. **Topology** (`topo_*`) rebuilt: see below.
5. **Coverage** written to `coverage` and printed.

Hand-made rows use **negative ids** and survive every rebuild. Add a missing signal as
`rail_signal(node_id=-1, ...)`; for a missing track also add `osm_way(-1)` and its
`osm_way_node` rows with negative node ids, and it joins the graph on the next run.

## Tables

| Table | Key | Content |
|---|---|---|
| `scope_line`, `scope_station`, `scope_connection`, `scope_facility` | name | The workbook, plus each station's OSM match |
| `osm_node`, `osm_way`, `osm_way_node`, `osm_relation`, `osm_relation_member` | OSM id (+ seq) | Lossless raw OSM: tags as JSON, metadata, ordered children, `in_scope` flag |
| `rail_track` | way id | railway type, lifecycle state, usage, service, ref, name, operator, owner, track ref, gauge (+mm), electrified, voltage, frequency, maxspeed (+forward/backward), preferred direction, train protection (strongest system + all `railway:<system>` keys), tunnel, bridge, layer, length, coordinates, bbox |
| `rail_station` | type + id | station, halt, tram_stop, junction, yard, crossover, spur_junction, service_station, site |
| `rail_platform` | type + id | ref, name, height, length, linked station, outline |
| `rail_signal` | node id | ref, main category, every `railway:signal:*` tag (e.g. `AU:QLD:main`, states), direction, position, line km, deactivated |
| `rail_switch` | node id | ref, type, turnout side, electric, heated, local operated, resetting, straight/diverging speeds |
| `rail_feature` | type + id | milestone, level_crossing, buffer_stop, derail, signal_box, stop_position, owner_change, traction_substation, station_building, railway landuse, lifecycle features, ... |
| `rail_route`, `rail_route_member`, `rail_route_master` | relation id | PTv2 routes with ordered members and the chained route path (`ok` or `gaps`) |
| `topo_node` | node id | switch, crossing, junction (untagged degree ≥ 3), end, buffer_stop, split |
| `topo_edge` | edge id, unique (way, seq) | track piece between split nodes, length, geometry |
| `topo_switch_leg` | switch + branch edge | trunk → straight / diverging, from the geometry at the switch |
| `topo_edge_feature` | edge + feature | signals, switches, features, platforms and stations along an edge: offset (m), snap distance, facing |
| `rtree_track`, `rtree_edge` | | R*Tree spatial indexes for viewport and snapping queries |
| `ingest_run`, `source_snapshot`, `coverage` | | Provenance (sha256 of every raw snapshot) and measured completeness |

## Topology

Ways are split at every node shared by two or more track ways and at nodes tagged
`railway=switch|railway_crossing|buffer_stop`. At a three-edge node the two edges that
leave in the most similar direction are the branches and the third is the trunk; the branch
closest to straight-through is the straight leg. Signal facing comes from
`railway:signal:direction` relative to the way (edges keep way order). Features that are
not track vertices are snapped to the nearest edge (signals ≤ 30 m, features ≤ 50 m,
platforms ≤ 60 m, stations ≤ 300 m).

## What OSM can and cannot give

Expected for SEQ (confirm with the coverage report after the first real run):

- Near complete: running lines, sidings and yards, stations, platforms, route relations, gauge.
- Partial: speed limits, electrification tags, switch refs and types, platform heights.
- Patchy: signals and signal types (the Queensland signal tagging scheme is still a draft),
  train protection keys, milestones.
- Not in OSM at all: interlocking, track circuits, braking curves, timetables.

Where OSM is silent, add rows by hand (negative ids) or leave the gap visible. The coverage
report and the presaved queries (“Running lines missing a speed limit”, “Untagged
junctions”, “Sheet stations not matched to OSM”) show where.

## Licence

OSM data is © OpenStreetMap contributors under ODbL 1.0. Keep the attribution; a shared copy
of `trainsim.sqlite` is a derivative database under ODbL's share-alike terms.
