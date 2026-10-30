# Simulation data and execution

TrainSim currently provides illustrative route playback and timetable-based train
positions. ESIG adds source evidence and draft implementation requirements; it is
not yet an executable ETCS engine.

## Current simulation paths

| Path | Data | Execution | Result |
| --- | --- | --- | --- |
| Single train | Ingested OSM route geometry and configured QR EMU profile | `createRouteScene` followed by deterministic `SimRun.step()` calls | Train position, next stop and illustrative warnings |
| Calendar | Translink GTFS trips, stops, service dates and shapes | Time-based schedule interpolation | Simulated service positions and scheduled stop times |
| ESIG scenario | Synthetic GA/SA JSON and source-clause references | Documentation only at present | Expected assertions, not an executed verdict |

Map playback and GTFS interpolation do not establish movement authority, braking
curves, interlocking validation or ETCS conformance. The pure engine lives under
`src/shared/`; presentation and playback controls live under `src/client/map/`.

## World and train state

The world database supplies directed track topology, track placement, stations,
signals and routes. Train profiles specify icon skin and carriage count. GTFS
trip IDs identify scheduled services; QR EMU profile IDs describe the visual
profile assigned to a service, not a real physical trainset.

Single-train playback selects the longest continuous route piece, converts WGS84
geometry into train state and advances along segments by a configured distance
per step. Playback controls schedule steps; simulation decisions must not depend
on browser timing or map vendor state.

## Calendar assumptions

Weekly service patterns repeat across the simulation window, including outside
the published feed period. Exact date exceptions override weekly patterns.
Stored Queensland public holidays use the Sunday pattern unless the source feed
has an explicit date exception. This is a simulation fallback and does not
recover historical or special-event timetables.

## ESIG rule path

The intended path is source evidence, reviewed interpretation, module
implementation, independently checked scenario, then recorded verdict.
Keep SRS issue, ETCS application level, ETCS mode and ETCS system version separate.
An ESIG catalogue record or synthetic expected assertion never activates a rule.

See [ESIG ingestion and evidence boundaries](../esig-ingestion.md),
[module contracts](modules.md), [scenario contracts](scenarios.md), and
[function requirement records](../sigreqs/README.md).
