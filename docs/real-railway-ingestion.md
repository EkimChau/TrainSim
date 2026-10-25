# Regional real-world rail ingestion — phase 2

## Data lineage and legal boundary

- **Historical reference only:** user-supplied TransLink / Queensland Rail network diagram **effective January 2012** at `data/reference/translink-network-map-2012.png`, with manually transcribed 22 line/railbus/busway/future groups and 145 unique rail-listed stops in `data/reference/diagram-catalog.json`. Image is explicitly not to scale; diagram links are *logical order*, not geographic polylines. Manual transcription needs stakeholder verification. Diagram attribution and redistribution rights should be reviewed before public distribution.
- **Geography / authoritative input for this prototype:** current *OpenStreetMap* railway tags and node/way/relation geometries exposed through Overpass. OpenRailwayMap uses OSM railway mapping; we reuse those original OSM tags, node IDs, way node ordering, and relation members rather than copying OpenRailwayMap API infrastructure, tiles or GPL styles. OSM object IDs and version are preserved in SQLite. **OSM itself is community-maintained, not an operational railway safety authority.**
- **Reproducibility:** `data/current/raw/*.json` contains byte-for-byte, immutable downloaded Overpass JSON responses with timestamp, source and SHA-256 recorded in `data/current/manifest.json`. SQL `osm_objects.object_json` retains the original object, `tags_json` retains native tags, `osm_ways.nodes_json` retains native way membership, and `osm_relations.members_json` retains native relations. `data/current/rail.sqlite3` is an indexed *derived* query view; `data/current/world.json` is the browser rendering export. The raw data should be archived if used for reproducibility, but is gitignored by default for size/licence separation.
- **OSM licensing:** © OpenStreetMap contributors, ODbL 1.0. Attribution is added to the visualizer when using the derived OSM world. Assess share-alike obligations and derivative database distribution separately from TrainSim source licence.

## Region

A deliberately generous retrieval envelope of latitudes `-28.20` to `-26.10` and longitudes `151.95` to `153.58` includes the historical railway diagram endpoints, e.g. Gympie North, Helidon railbus interchange region, Cleveland, and Varsity Lakes. Four overlapping *corridor rectangles* limit public Overpass query costs compared with a monolithic rectangular bounding box. They are coarse windows for extracting railway features, **not** an inferred railway boundary. Busways, replacement railbuses, and proposed infrastructure are never silently turned into currently operating rail lines.

## Run

Requires Python 3 (standard library only), internet access, and a reachable Overpass server. From project root:

```bash
python3 scripts/ingest_osm.py --download
# or load already downloaded Overpass JSON without modifying it:
python3 scripts/ingest_osm.py --osm-json /path/to/overpass-part1.json /path/to/overpass-part2.json
npm run build && npm start
```

The script prints the number of rail track ways, OSM railway stations and **fully connected line traces**. The Express server serves `/api/region/world` and `/api/region/manifest` only when a snapshot is present; otherwise the established synthetic seed continues to run. The SVG preview shares the world endpoint. The normal Google Maps adaptor draws *each OSM railway way* from its complete WGS84 node geometry, shows stations at mapped OSM coordinates, and fits the observed railway station envelope. Trains use distance-based positional stepping over a continuous graph path. **A route cannot play unless all historical-listed stops on that line can be matched and joined by shared OSM railway node IDs.** This is a deliberately strict acceptance gate, not a guarantee of timetable routing, platforms, switching or direction of travel.

Where imported OSM contains no complete service line, the geographical infrastructure and stations still appear but simulation playback is disabled. Inspect the `unresolved_pairs` in `data/current/world.json` and `diagram_stops` table. Do not generate geometrically fabricated bridge segments or snap across track gaps. Possible follow-up: match route=train relations and platform/stop_position relation memberships, map aliases and manual review of ambiguous stations.

## Datastore: SQLite now, GeoParquet later

`sqlite3` is a no-install, portable source for OSM objects, way/node topology, indexed edges, stop matching, and ingest manifests. Original 1:N relations and all tag keys are preserved. It is better suited to graph and identity queries than a single Parquet table. Export the same reproducible snapshot to GeoParquet/DuckDB for large-scale analytical, columnar and spatial queries after the transport graph is validated. SQLite is **not** itself GeoParquet or a full-fledged geospatial index here.

## Important alignment limit

Google Maps JS accepts native WGS84 `Polyline` coordinates but **does not provide an API that returns the underlying railway-basemap vector geometry**. Overlay positions can be correct relative to OSM while differing visually by a few pixels from Google's generalized basemap. Do not digitally trace the historical diagram's colored routes or snap OSM tracks to Google basemap graphics; that would introduce unverified geometry. Source provenance must be shown for visual discrepancies.

## Verification scope

The repository intentionally ships **no live imported Queensland OSM dataset**. CI tests use `data/fixtures/osm-synthetic-test.json`, explicitly marked as fake for parser and graph contract testing. This demonstrates the import and display path, NOT that the entire historical network has already been ingested or validated. Live retrieval, service-line topology and GIS position acceptance tests must occur where internet and Google Maps keys are available. Retained 2012 names or statuses may differ from present-day OSM.
