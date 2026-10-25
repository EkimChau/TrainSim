# Prototype boundaries & architecture contract

## Intent (preserved from the seed README)

The main canvas is Google Maps with a SimAdaptor providing all map rendering calls. OpenRailwayMap/OSM ways, stations and signals are eventual infrastructure inputs, constrained initially to Brisbane and surrounds, with WGS84 positions. TrainSim should own a separate authoritative simulation world, not delegate simulation state to the map widget. Layer toggles must not mutate the underlying world.

`SimSpec` will eventually compile a regional track topology into configured signalling components according to selected regional laws and ETCS/UNISIG profiles. `BaseModels` define unconfigured component types. `SimWorld` owns deployed instances, tracks, stations, trackside devices, trains and command/schedule state. `SimScene` specifies a scenario. `SimRun` advances the scenario against the world, produces observable `SimStates` and supplies an overlay renderer. The view never owns train motion rules or compiler outputs.

## Prototype module ownership

```text
Node.js Express (server/*)
 ├─ /api/config and /api/health
 └─ GIS authentication: signed session cookie, token verification

Bun build (src/client/main.js → public/assets/app.js)
 ├─ UI controller / scene playback
 └─ SimAdaptor
     ├─ Google Maps renderer (configured deployment)
     └─ local SVG schematic renderer (zero-credential demo)

src/shared/ (no DOM or Maps imports)
 ├─ BaseModels
 ├─ SimWorld  ← source: synthetic mock seed today
 ├─ SimSpec   ← midpoint heuristic ONLY today
 ├─ SimScene  ← three original scenarios
 └─ SimRun    ← deterministic time step and warnings
```

## Non-negotiable separation & provenance

1. Map/identity vendors are outside the pure simulation engine.
2. Synthetic seed geometry cannot be labeled ORM-derived, surveyed, topology-validated or engineering-grade.
3. Midpoint markers cannot be labeled validated balise positions; synthetic proximity warnings cannot be labeled implemented ETCS or RBC behaviours.
4. Future provenance must track OSM way/node IDs, ingestion timestamp, bounding region, data license, source coordinate system, transformed WGS84 data and source revisions. Do not overwrite the mirrored source record when generating derived assets.
5. Future law/rule engine must associate each deployed component and decision with rule ID, version, input evidence and test vectors before promoting it beyond illustrative prototype.
6. SimRun's deterministic step interface is a stable extraction point for server-side execution, replay, trace logging and formal validation. Current frontend timers are presentation scheduling only.

## Acceptance gates

Prototype: working compile/play/stop with seed, passing pure-model tests and visible warnings. Next milestone: real ORM ingestion plus reproducibility, no claims of compliance. Production or engineering use requires separate specification, safety assurance and rule verification; unit tests of this mock are insufficient.
