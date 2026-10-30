# Prototype boundaries & architecture contract

## Intent (preserved from the seed README)

The main canvas is Google Maps with a SimAdaptor providing all map rendering calls. OpenRailwayMap/OSM ways, stations and signals are eventual infrastructure inputs, constrained initially to Brisbane and surrounds, with WGS84 positions. TrainSim should own a separate authoritative simulation world, not delegate simulation state to the map widget. Layer toggles must not mutate the underlying world.

`SimSpec` will eventually compile a regional track topology into configured signalling components according to selected regional laws and ETCS/UNISIG profiles. `BaseModels` define unconfigured component types. `SimWorld` owns deployed instances, tracks, stations, trackside devices, trains and command/schedule state. `SimScene` specifies a scenario. `SimRun` advances the scenario against the world, produces observable `SimStates` and supplies an overlay renderer. The view never owns train motion rules or compiler outputs.

## Runtime data authority

All running app features use `data/simworld/simworld.sqlite`, a fictitious world.
The isolated corpus (`data/corpus/corpus.sqlite`) and official source registry
(`data/esig/esig.sqlite`) are ingestion/reference inputs. The geography/timetable
database is also staging input. Runtime does not fall back to any input database.
Publication copies pinned reference snapshots and preserves SimWorld overrides.
See [SimWorld isolation](sim/simworld.md).

## Module ownership

```text
scripts/ingest_osm.py + scripts/ingest/   (Python, stdlib)
 ├─ xlsx.py      docs/stations.xlsx → scope
 ├─ sources.py   Overpass tiles | Geofabrik/PBF via osmium | OSM XML/JSON files
 ├─ scope.py     station name matching, 20 km scope
 ├─ store.py     schema, idempotent upserts by OSM id, prune, provenance
 ├─ derive.py    rail_* layers (OpenRailwayMap data model)
 ├─ topology.py  topo_* track graph, switch legs, linear referencing
 └─ report.py    measured coverage
        ↓
data/trainsim.sqlite  (staging input only; schema: db/trainsim/schema.sql)

Node.js Express (server/*), loopback only, no sign-in
 ├─ db/console.js    every project SQLite DB: browse, filter, live CRUD, one-statement SQL
 ├─ db/query-log.js  every call logged: unique per (database, SQL), count, last call
 └─ map-api.js       viewport features, feature detail, search, routes (logged as 'api')

Bun build (src/client/app.js → public/assets/app.js)
 ├─ map/   Google Maps (or OSM tiles) + deck.gl overlay in ORM styles, inspector, simulation panel
 ├─ data/  Tabulator editor
 └─ query/ CodeMirror SQL editor + saved/called query list

src/shared/ (no DOM or map imports)
 ├─ models.js    Train, WGS84 coordinates
 ├─ simscene.js  scene from an ingested OSM route path
 └─ simrun.js    deterministic fixed-step engine
```

## Non-negotiable separation & provenance

1. Map/identity vendors are outside the pure simulation engine.
2. Synthetic fixture geometry (`data/fixtures/`) cannot be labeled ORM-derived, surveyed, topology-validated or engineering-grade.
3. Midpoint markers cannot be labeled validated balise positions; synthetic proximity warnings cannot be labeled implemented ETCS or RBC behaviours.
4. Future provenance must track OSM way/node IDs, ingestion timestamp, bounding region, data license, source coordinate system, transformed WGS84 data and source revisions. Do not overwrite the mirrored source record when generating derived assets.
5. Future law/rule engine must associate each deployed component and decision with rule ID, version, input evidence and test vectors before promoting it beyond illustrative prototype.
6. SimRun's deterministic step interface is a stable extraction point for server-side execution, replay, trace logging and formal validation. Current frontend timers are presentation scheduling only.

## Acceptance gates

Current: reproducible OSM ingestion with provenance and coverage, a derived track graph, and illustrative playback along real route geometry. No claims of compliance. Production or engineering use requires separate specification, safety assurance and rule verification; unit tests of this mock are insufficient.

## ESIG source registry and conformance boundary

ESIG is a separate source-evidence subsystem under `db/esig/`,
`scripts/esig/`, `data/esig/catalog/` and `data/esig/examples/`.
It ingests **all** SUBSET-026 v4.0.0 chapters 1–9 into local, generated SQLite,
using SHA-pinned documents and all-page text retention. Chapter 9 classification
rows are extracted as unverified candidates. Figures, tables, equations, legends,
protocol layouts and clause boundaries must be reconciled against the originals.
No ingested clause is automatically executable or verified.

```text
Original official PDFs -> immutable source_page / extracted clause / classification_row
                        -> reviewed rule evidence + applicability + exception graph
                        -> SimSpec compile to a GA network configuration
                        -> SimScene initial state/stimuli + SA assertions
                        -> SimRun deterministic transitions / typed interfaces
                        -> SimStates trace and verdicts
```

Keep `etcsLevel` (0 / NTC / 1 / 2), `etcsMode`, `etcsSystemVersion`
and `srsIssue` separate. ETCS Level 4 does not exist in SUBSET-026 4.0.0;
Level 3's Chapter 2 section is intentionally deleted. Do not interpret
Baseline 4 as an application level. `SimAdaptor` never owns safety decisions.
Interlocking/TMS belong to separate specifications and component contracts;
SUBSET-026 alone does not define the whole railway operational system.

Promotion beyond illustrative simulation requires: source-clause/page lineage,
Chapter 9 classification verification, chapter 6 exception handling, explicit
version/mode/level applicability, protocol and braking model validation,
and separately sourced acceptance tests (e.g. the SUBSET-076 family).
Details and commands: [ESIG ingestion](esig-ingestion.md).

## Database console boundary

The Data and Query pages default to SimWorld and inspect source/corpus files read-only
through one adapter, `server/db/console.js`. The API has no sign-in or roles by design and
rejects non-loopback clients; never expose it through a tunnel or reverse proxy. Runtime edits change SimWorld immediately. Reference snapshot tables are read-only. Every statement the app runs (grid, editor and map API) is logged
in `data/local/console.sqlite`. Databases built from TrainSim's schemas declare
`schema_info.natural_keys='all'`: every table is keyed by OSM or natural ids, so the console adds
no duplicate-protection triggers there. SimWorld reference snapshots have separate read-only guards. Other databases get a duplicate-payload insert trigger per table, and every
row added from the grid is checked against identical rows first. Editing ESIG rows is not a
verified rule-authoring path.
