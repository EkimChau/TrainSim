# Runnable railway scenario dataset selection

As-of **2026-10-31**. All source records, revision pointers, licences and downloadable URLs live in [scenario-datasets.json](scenario-datasets.json).

**Definition of 'complete':** all data needed to *exercise the named subsystem scenario* are present in the linked package, or all source information for the named infrastructure problem is supplied. **None** is asserted to be a complete certified TMS→interlocking→RBC→OBU ETCS system. Model boundaries are intentional, documented gaps, not falsely filled fields.

## Highest-value scenarios and what is actually complete

| Scenario ID | Found source | Data and executable boundary | Still missing if promoted to ETCS L2 |
|---|---|---|---|
| IXL-01: lock, conflict, train release | [OSM Interlocking locking table](https://github.com/osmhpi/interlocking) | Pinned application and runnable simulator; 2 routes, 2 points, 5 zones, 14 transits, 3 signals | No OBU or RBC, timetable and communication |
| IXL-02: geographical route discovery | [OSM Interlocking geographical](https://github.com/osmhpi/interlocking) | Pinned application + route-search logic and simulator, same specific application scale | No OBU or RBC |
| SIG-01: detailed station asset and route graph | [OSRD small_infra](https://github.com/OpenRailAssociation/osrd) | RailJSON with 31 track sections, 17 switches, 106 signals, 92 detectors, 70 routes, 2 level crossings | No full site-specific interlocking conditions or ETCS stack |
| OPE-01: station throughput & mixed trains | [SBB UC1](https://github.com/SchweizerischeBundesbahnen/railsim-experiments) | 3 variants: through track + 1/2/3 platforms; network, stock and demand generator | No vital signal logic |
| OPE-02: junction conflict & grade separation | [SBB UC2](https://github.com/SchweizerischeBundesbahnen/railsim-experiments) | Flat junction and grade-separated variants with operational plans | No site-specific route locking or RBC |
| OPE-03: train reversals and platform occupation | [SBB UC3](https://github.com/SchweizerischeBundesbahnen/railsim-experiments) | Side/middle reversing variants, train profiles and plans | No full signal route control tables |
| OPE-04: fixed versus moving blocks | [SBB UC0](https://github.com/SchweizerischeBundesbahnen/railsim-experiments) | Calibration experiment with resource/capacity output | Abstract blocks; not proof of ETCS Level 3 |
| TMS-01: Norwegian disruption management | [DISPLIB](https://displib.github.io/) | Delay/resource/train constraints and solution checker; full-day Jærbanen instances | No micro signalling assets or interlocking |
| TMS-02: Italian freight dispatch conflicts | [DISPLIB](https://displib.github.io/) | Freight-weighted real dispatch-derived problem instances, alternatives and best known solutions | No real train dynamics, signals or RBC |
| IXL-03: route overlap and sectional release | [railML.org Simple Example](https://development.railml.org/railml/version3/-/blob/railML-3.1-final/examples/railML.org_SimpleExample_v11_railML3-1_04.xml) | railML 3.1 station topology, train vacancy detection, routes, overlaps and release groups | No complete train movement schedule; restricted upstream licence |
| IXL-04: real Dutch station data | [TU Delft Santpoort-Noord](https://doi.org/10.4121/12681368) | Research XML data, schema and interlocking topology/logic | Not a complete national operating model |
| IXL-05: multi-junction generated control tables | [GICSAFePhD RailML](https://github.com/GICSAFePhD/RailML) | 8 interlocking scenarios; largest 90 routes / 23 switches or 87 routes / 21 switches | Licence not established, no train schedules |
| TRAIN-01: full driving exercise | [Open Rails BNSF Starter](https://www.openrails.org/download/content/) | Trainsets, tracks, signals, activities, route; 598MB download | US signalling, not ETCS; redistribution not granted |
| TRAIN-02: 20-minute journey | [Open Rails Demo Model 1](https://www.openrails.org/download/content/) | Edinburgh–Linlithgow UK route, train activity, signals, stock | No RBC/ETCS or native TrainSim data contract |

## Data that has actually been imported into TrainSim

- **Unmodified** upstream GPLv3 OSMHPI specific-application JSONs:
  - [locking-table configuration](dataset-seeds/osmhpi/locking_table.json)
  - [geographical configuration](dataset-seeds/osmhpi/geographical.json)
- [Full original GPLv3 text](dataset-seeds/osmhpi/LICENSE.md) and [upstream attribution/commit + SHA provenance](dataset-seeds/osmhpi/README.md).
- GitHub-reported original Git blob SHAs were checked for **exact equality after copying**. Their generic application simulators remain in the upstream repository, and must be fetched to run them.

These are **real third-party configuration datasets**, not invented railway control tables. They are seeds for two complete *interlocking-specific-application* test scenarios, not standalone executables by themselves.

## Fetch the remaining original packages (not rehosted in public Git)

```bash
python3 public/internet-specs/check_datasets.py
python3 public/internet-specs/fetch_datasets.py --list
python3 public/internet-specs/fetch_datasets.py --id OSRD-SMALL-INFRA
python3 public/internet-specs/fetch_datasets.py --id SBB-UC1 --id SBB-UC2 --id SBB-UC3
python3 public/internet-specs/fetch_datasets.py --id DISPLIB-NOR
python3 public/internet-specs/fetch_datasets.py --id RAILML-SIMPLE31
# Large complete routes only when explicitly desired:
python3 public/internet-specs/fetch_datasets.py --id OPENRAILS-BNSF --include-large
```

The fetcher downloads into `public/internet-specs/downloads/scenario-datasets/`, **does not execute any downloaded code or unzip untrusted files**, validates JSON/XML/ZIP integrity, and writes a local SHA-256 `scenario-download-lock.json`. Execute it only in a sandboxed, networked repository checkout. Some official URLs may change or rate-limit; a completed fetch still needs format-specific assessment. The fetcher has **not been network executed** in this PR.

## Minimal TrainSim adapter plan (separate implementation task)

Keep source-specific import adapters. Do **not** convert all files into an unproven generic signalling scheme.

1. **Infrastructure/route data**: parse `OSRD small_infra` RailJSON into a new isolated scenario profile with original track, point, detector, signal and route IDs; preserve foreign-key references.
2. **Executable IXL model**: keep OSMHPI generic application semantics unchanged. Drive it via documented adapter events (route request, points detected, occupancy, approach zone, cancellation). Never infer a commercial IXL from a route list.
3. **Traffic scenarios**: consume SBB use cases and/or DISPLIB traffic benchmarks as independent scheduled/dispatch operations. Do not copy route IDs between unrelated layouts.
4. **Full train operations**: preserve Open Rails' existing route/activity formats; do not pretend it implements ETCS Level 2.
5. **Synthetic end-to-end testbed**: only after interfaces are defined, create a new hypothetical scenario combining separately sourced subsystem *ideas*, explicitly marked synthetic—not a reproduction of any specific working network.

An accepted scenario should have: **version-pinned input, known model boundary, deterministic commands, expected constraints, an executable replay, observed output, safety invariants and source-specific licence**. No claims of approvals are needed to get an honest, useful simulator.

## Evidence and limits

- OSRD source file was directly inspected through the GitHub repository and numeric counts extracted from the JSON.
- OSMHPI two original configuration JSONs were read, counted, copied, and the exact Git blob SHAs checked after copy.
- SBB full source README and the `UC2_BB2` configuration were checked; **individual runtime simulations not executed**.
- DISPLIB, Open Rails, railML and publisher-academic sites describe their examples; archive bytes are not yet validated.
- Some repositories have restrictive/unclear licences: railML sample is restricted CC BY-NC-ND plus terms; proprietary Open Rails routes are free to download but not necessarily free to republish; GICSA source has no confirmed permission. They are not vendored.
- Public Queensland Rail / Aurizon Logic Navigator sample projects are directed at staff and subcontractors; they should not be silently redistributed. The separate generic station collection is available for external users, but its own licence and runtime must be respected.
