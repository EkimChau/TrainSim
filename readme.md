# TrainSim

TrainSim runs a **fictitious SimWorld**, derived from isolated corpus and source
snapshots. All runtime features use `data/simworld/simworld.sqlite`. Official
evidence and the local corpus remain separate, read-only reference inputs.
See the [SimWorld data boundary](docs/sim/simworld.md).

A railway world for South East Queensland built from OpenStreetMap, the same data
[OpenRailwayMap](https://openrailwaymap.app) draws. TrainSim ingests every railway
object around the stations in [`docs/stations.xlsx`](docs/stations.xlsx) into one
SQLite database, draws it in OpenRailwayMap's styles over Google Maps, lets you
inspect source references and edit fictitious SimWorld data, and plays trains along real OSM routes.

**Illustrative simulator, not a railway engineering or safety system.**

## Quick start

Needs Node.js 22+, [Bun](https://bun.sh/docs/installation) and Python 3.10+ (standard library only).

```bash
cp .env.example .env          # optional: add GOOGLE_MAPS_API_KEY
npm install
npm run ingest                # fetch OSM data for every sheet station + 20 km (cached; re-runnable)
npm run ingest:translink      # fetch current SEQ train timetables and annual holiday dates
npm run build && npm start    # http://127.0.0.1:3000
```

Or `./run.sh --ingest` to do all of it. Without a Google key the map falls back to OpenStreetMap tiles.

| Command | What it does |
|---|---|
| `npm run ingest` | Whole sheet (143 stations, Gympie North to Varsity Lakes), 20 km buffer, Overpass API |
| `npm run ingest:translink` | Refresh train-only schedules, stops, shapes and QLD public-holiday dates from official sources |
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
  a feature inspector with all OSM tags and track placement, and a simulation panel that
  runs a train along any ingested route. The Base map selector changes only the background:
  OpenStreetMap is the default/current appearance, and Google roadmap, satellite, hybrid
  and terrain are available when `GOOGLE_MAPS_API_KEY` is configured. Railway and train
  overlays remain visible when changing the background. The separate ORM raster reference
  overlay remains available as a layer.
  The QR EMU marker is a fixed-pixel vector model for one three-car unit; six-car trains
  show two linked unit icons. Click a running train to enlarge its model and view its next
  stop and destination; clicking elsewhere or pressing Escape returns it to normal.
  Pause playback to adjust and save the model-axis offset (the SVG's long axis is vertical);
  resume or stop with the Simulation controls.
  Choose one of six engine records in `rail_emu_train` (3-car default, `3a`/`3b` skin);
  set `carriage_count` to 6 in Data to use two units. The saved Sketchfab MHTML contains
  the page and preview images, not mesh/texture files, so these are custom vector
  approximations rather than extracted 3D models.
- **Data**: SimWorld is editable; official/source/corpus inputs are read-only. Browse, filter, sort and edit runtime cells live,
  add rows (duplicates are rejected) and delete rows. Uses Tabulator.
- **Query**: CodeMirror SQL editor with table/column autocomplete and ▶ Play
  (Ctrl/⌘+Enter). The list shows presaved queries and **every call the app made to any
  database**, unique per SQL text, most recent first, with a call count.
- **Docs**: this README, development guides, ESIG source catalogues, synthetic
  scenarios and simulation function requirements in one documentation area.
  **Refresh references** imports isolated corpus data and publishes a SimWorld snapshot. Module pages
  distinguish draft requirements from implemented and verified records.

Run `npm run build:simworld` for initial construction and legacy-source isolation.
Run `npm run ingest:functional` (or `ingest:docs`) to populate the corpus, refresh
SimWorld reference snapshots and export the documentation catalogue;
`npm run build` also runs ingestion. Details: [Docs app and file ingestion](docs/docs-app.md).

No sign-in and no permissions by design. The API only answers loopback clients, so keep
`HOST=127.0.0.1` and never expose the app through a proxy or tunnel. Edits change the live files.

### Calendar simulation data

The map opens in **Time** mode; **Single** retains the hand-selected OSM route simulator.
Time mode reads Translink's official [SEQ GTFS feed](https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and uses its
train routes, trips, stop times, stops, service calendars, date exceptions and shapes.
Run `npm run ingest:translink` to download and refresh these tables in `data/trainsim.sqlite`;
use `python3 scripts/ingest_translink_gtfs.py --feed PATH --db PATH` to import a saved ZIP
or a different database.

GTFS calendar weekday patterns are repeated for the two-years-before/two-years-after
simulation window, including outside the source feed's published date bounds. Exact
`calendar_dates.txt` exceptions apply only to their source dates. The importer also stores
Queensland public-holiday dates (including Brisbane RNA Show Day) from the official
[Queensland public holidays rules](https://www.qld.gov.au/recreation/travel/holidays/public).
On a holiday the simulation uses the GTFS Sunday pattern, with any exact feed exception
taking precedence. Translink's current static feed does not provide a separate historical
or public-holiday timetable series; this Sunday-pattern holiday service is an explicit
simulation fallback, not a claim that historical special timetables have been recovered.
Train icons use the six QR EMU profiles in `rail_emu_train`; the GTFS trip shape supplies
the train's map position and direction. GTFS does not identify physical trainsets or
carriage formations, so trips are assigned reproducibly across the six existing profiles
and use their configured carriage counts (three by default); this visual assignment is not
an assertion about the real fleet allocation. These are simulated timetable runs, not live
train positions. The Time panel's **Train** layer provides the active service list with each
GTFS route long name, destination, and scheduled origin/destination station times. QR EMU
profile IDs identify the train icon appearance, not physical trainsets.
Select a service or train icon to focus the train, follow its position, and open its details.

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
