# Simulation modules and interfaces

The module names describe ownership. Several modules remain architectural
contracts rather than separate implemented directories.

| Module | Inputs | Owns | Outputs and consumers |
| --- | --- | --- | --- |
| SimSpec | Reviewed rules, applicability and infrastructure evidence | Compile-time rule selection and configuration | GA configuration consumed by SimWorld and SimRun |
| BaseModels | Component definitions and typed interface requirements | Unconfigured component contracts and units | Model types consumed by world and scenario code |
| SimWorld | GA configuration and deployed infrastructure/train data | Authoritative simulation world | Explicit state supplied to the engine |
| SimScene | World references and scenario definitions | Initial conditions, timed stimuli and expected assertions | Scenario passed to SimRun |
| SimRun | Explicit world state, scenario inputs, simulation time and ruleset | Deterministic transitions and decisions | State changes and events supplied to SimStates |
| SimStates | Engine transitions and decision evidence | Trace records, replay and verdict lineage | Observations for diagnostics and display |
| SimAdaptor | World/trace observations | Map and UI presentation | Display output and user interaction |

## Existing implementation pointers

`src/shared/models.js` contains train and coordinate models.
`src/shared/simscene.js` builds a scene from an ingested OSM route.
`src/shared/simrun.js` implements fixed-step illustrative route playback.
`src/shared/formation.js` supplies geometry and train-formation helpers.
The current map UI owns playback scheduling and calendar presentation.

These files are not a completed implementation of every module in the table.
Module pages show authored requirement counts, including zero where contracts
have not yet been decomposed into function records.

## Interface requirements

Pass simulation time and input state explicitly. Each transition must describe
its accepted state shape, units, valid ranges, guard ordering, outputs, state
effects, error behavior and event ordering. Keep vendor map APIs and DOM state
outside pure engine interfaces. Preserve official protocol field names.

Use a single owner for each function. Parent/child links describe functional
decomposition; dependency and exception links describe rule relationships.
Do not use display modules to resolve signalling decisions.

Every future decision trace must include the function record ID/revision,
source evidence, selected applicability, input facts and resulting state/event.
Implementation pointers and tests are linked through the
[function metadata contract](../sigreqs/README.md).
