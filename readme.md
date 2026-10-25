# TrainSim

A railway world for South East Queensland built from OpenStreetMap, the same data
[OpenRailwayMap](https://openrailwaymap.app) draws. TrainSim ingests every railway
object around the stations in [`docs/stations.xlsx`](docs/stations.xlsx) into one
SQLite database, draws it in OpenRailwayMap's styles over Google Maps, lets you
browse and edit every database live, and plays trains along real OSM routes.

**Illustrative simulator, not a railway engineering or safety system.**

## Quick start

Needs Node.js 22+, [Bun](https://bun.sh/docs/installation) and Python 3.10+ (standard library only).

```bash
cp .env.example .env          # optional: add GOOGLE_MAPS_API_KEY
npm install
npm run ingest                # fetch OSM data for every sheet station + 20 km (cached; re-runnable)
npm run build && npm start    # http://127.0.0.1:3000
```

Or `./run.sh --ingest` to do all of it. Without a Google key the map falls back to OpenStreetMap tiles.

| Command | What it does |
|---|---|
| `npm run ingest` | Whole sheet (143 stations, Gympie North to Varsity Lakes), 20 km buffer, Overpass API |
| `npm run ingest:caboolture` | Only the Caboolture Line stations (+20 km) |
| `npm run ingest:geofabrik` | Same scope from the Geofabrik Queensland PBF (needs `osmium-tool`); fastest and most robust for full refreshes |
| `npm run ingest:fixture` | Offline: loads the small synthetic fixture so the UI has something to show |
| `npm test` | Node and Python tests (fixture based, no network) |

Flags: `--lines "A,B"`, `--radius-km 20`, `--db PATH`, `--refresh` (ignore the snapshot cache),
`--no-prune`, `--source file|pbf FILE`. Run `python3 scripts/ingest_osm.py --help`.

## What gets ingested

Everything OpenRailwayMap shows, from OSM, inside the scope: tracks (with usage, service,
gauge, electrification, voltage, speed limits, train protection, tunnels, bridges and
lifecycle state), stations and other operating points, platforms, signals (all
`railway:signal:*` tags and direction), switches, milestones, level crossings, buffer
stops, signal boxes, stop positions, traction substations, railway landuse, route and
route-master relations. From that the ingest builds a **track graph** for the simulator:
nodes at switches and joins, edges between them, the legal straight/diverging moves at each
switch, and every signal, switch, crossing, platform and station placed along an edge.

Re-running is safe. Rows are upserted by OSM id, derived tables are rebuilt in one
transaction, raw elements that vanished upstream are pruned, and rows you add by hand
with **negative ids** are never touched. Each run writes a measured coverage report.

Details: [ingestion and data model](docs/ingestion.md).

## The app

One top bar with the global navigation and database switch at the top right.

- **Map**: Google Maps with a deck.gl overlay in OpenRailwayMap's styles (infrastructure,
  max speed, train protection, electrification, gauge), search, layer toggles, a legend,
  a feature inspector with all OSM tags and track placement, an optional ORM raster
  reference overlay, and a simulation panel that runs a train along any ingested route.
  The QR EMU marker is a fixed-pixel vector consist whose coaches follow route direction;
  choose one of six engine records in `rail_emu_train` (3-car default, `3a`/`3b` skin).
  Set `carriage_count` to 6 in Data to join two three-car units. The saved Sketchfab MHTML
  contains the page and preview images, not mesh/texture files, so these are custom vector
  approximations rather than extracted 3D models.
- **Data**: every SQLite database in the project. Browse, filter, sort and edit cells live,
  add rows (duplicates are rejected) and delete rows. Uses Tabulator.
- **Query**: CodeMirror SQL editor with table/column autocomplete and ▶ Play
  (Ctrl/⌘+Enter). The list shows presaved queries and **every call the app made to any
  database**, unique per SQL text, most recent first, with a call count.

No sign-in and no permissions by design. The API only answers loopback clients, so keep
`HOST=127.0.0.1` and never expose the app through a proxy or tunnel. Edits change the live files.

## Layout

| Path | Role |
|---|---|
| `scripts/ingest_osm.py`, `scripts/ingest/` | Ingestion: sheet scope, sources, upserts, typed layers, topology, coverage |
| `db/trainsim/schema.sql` | World database schema |
| `db/trainsim/saved-queries.json` | Presaved queries for the Query page |
| `server/` | Express API: database console, query log, map API |
| `src/client/` | UI (bundled by Bun to `public/assets/`) |
| `src/shared/` | Map-independent simulation models and the deterministic `SimRun` step engine |
| `data/fixtures/osm-seq-fixture.osm` | Synthetic OSM test network (approximate positions) |
| `scripts/esig/`, `db/esig/` | ETCS SUBSET-026 source registry ([details](docs/esig-ingestion.md)) |

Generated and git-ignored: `data/trainsim.sqlite`, `data/cache/` (raw OSM snapshots), `data/local/console.sqlite` (query log).

## ESIG / SUBSET-026 registry

A separate staging registry of all nine SUBSET-026 v4.0.0 chapters (848 pages), unverified.
Place the nine PDFs in `data/esig/sources/subset-026/4.0.0/`, then `npm run ingest:etcs` and
`npm run check:etcs`. The resulting `data/esig/esig.sqlite` appears in the Data and Query pages.
See [ESIG ingestion](docs/esig-ingestion.md) and the [architecture contract](docs/architecture.md).

## Licences and attribution

Map data © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
A distributed copy of the world database is a derivative database under ODbL (share-alike).
The map styles imitate OpenRailwayMap's look with TrainSim's own definitions. The optional
ORM reference overlay loads tiles from tiles.openrailwaymap.org for interactive viewing only;
do not bulk-download them.
