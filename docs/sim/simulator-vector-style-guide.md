# TrainSim Simulator Mode — vector-world design contract (v1)

**First implementation:** authored Lesson **009**, **Interlocking proof → RBC boundary**.
**Status:** executable deterministic educational fixture; NOT ETCS conformance, NOT an approved signalling diagram and NOT a vehicle-control application.

## How to start

Build and launch TrainSim as normal. Select **Lesson 009** and click
**Simulator mode** on the lesson or Topics page, or use this hash route:

    #/tutorials?lesson=authored-ixl-boundary&simulator=1&scenario=normal

Simulator Mode stays within Tutorials. Use Back to return to the same lesson.
The page provides **Simulate**, **Pause**, **Step**, **Reset** and scenario switching.

## Architecture: one set of rules, many projections

| Layer | File | Responsibility |
| --- | --- | --- |
| Authored IXL evaluator | authored-engine.js | Existing Lesson 009 synthetic external IXL checks. |
| World / scenarios | simulator/world.js | Scene geometry, trains, detection, state progression, RBC reports and logical-tick trace. |
| SVG library | simulator/vector.js | Reused train, balise, signal, IXL, RBC, radio and axle-counter symbols plus track/points. |
| UI projection | simulator/view.js | DMI, step timeline, scenario selection, live component inspector and event log. |
| Navigation | tutorials/view.js | Hash router, controls, one-shot playback, cancellation and animation lifecycle. |
| Theme | public/tutorials.css | Warm paper shells, black Courier subheadings, muted Courier-red alerts, responsive panels. |

**No second IXL rules engine.** Route proof is delegated to the existing authored
Lesson 009 evaluator through stepLesson. The world supplies its competing-section
occupancy as a guard input. A successful proof requires the explicit first progress
event to lock point P1; it does **not** silently grant a Movement Authority.
Release occurs after TC2 is clear and the second progress event has been processed.

**Other events remain educational fixtures, not normative requirements:**
train movement, balise passage, radio report timing, illustrative MA information,
and level boundary context. The displayed DMI is intentionally not the standard
DMI layout. Unknown permitted/target speeds, operating modes and braking curves
remain **not modelled** rather than invented.

## Pure world model and reusability

Each world carries lessonId, scenarioId, step, tick, lessonState, trains,
point, route, balises, rbc, radio, ma and append-only logical-tick events.
simulateNextStep returns a new world without modifying the earlier one.
requestAnimationFrame interpolates *only the visible train position* between
committed world snapshots; it does not make independent safety decisions.

TRACK_WORLD defines a junction and three railway sections. trackPoint converts
the along-track metre position to a vector position and direction through the
turnout. occupancy derives track occupancy from train positions and paths;
those same values feed sensor colouring, the selected-route guard and
interactive component inspectors.

The component registry defines stable identifiers, types, names and boundaries.
The renderer uses common scalable SVG symbols and an accessible HTML
instrument panel for every selectable equipment item.

### Initial scenarios

- **Route proved → L2 entry:** prove route, reverse/lock points, approach and
  detect BG-1, send OBU position report to RBC, issue separate illustrative MA,
  traverse turnout, animate neighbouring train, detect BG-2, show L0-to-L2
  context, clear TC2 and release route.
- **Point detection failure and recovery:** fail P1, reject proof, explicitly
  restore evidence, re-evaluate then lock.
- **Conflicting train occupies route:** train B occupies TC2, proof fails,
  train B moves clear, and IXL must explicitly recheck before proof.
- **L2 → L0 illustration:** same reusable world and instruments with a
  separately labelled example transition, not a normative transition procedure.

### Accuracy boundaries

An RBC **does not obtain train coordinates from the radio mast**. The onboard
system estimates position from odometry and relevant balise-group references,
then reports that estimate over radio. The RBC panel preserves its last
received position while the train may continue to move: this can visibly
demonstrate stale reports.

SUBSET-026-2 v4.0.0 §2.4.1.3(d) classifies the interlocking as external to ETCS.
Actual control requires infrastructure-manager route tables, overlap, flank,
locking, detection and national operating rules. The educational guard
combination cannot replace those. L0/L2 visual context does not implement
full Chapters 4 and 5 transition, brake or radio protocol rules.

## Vector style guide

- Scene viewBox 1100×400, stable metre-based geometry, SVG-scaled presentation
- Native SVG symbols and use references, no bitmap sprites or CDN dependency
- Double steel-grey rails and sleepers; connected branching turnout geometry
- Fixed balises shown between rails, trains as reusable side-profile symbols
- Schematic signals clearly identified as non-operational indications
- Green = proved/clear/active training result; red = blocked/occupied; amber =
  pending; blue = radio/information; grey = inactive
- Consistent black Courier headings and subheadings, muted red Courier alerts
- Hand-drawn style on panel borders/annotations, not numeric readout fonts
- Accessible keyboard selection of SVG equipment and a matching HTML inspector
- Respect reduced-motion by presenting immediate snapshots, not forced tweens
- Adapt to smaller screens by horizontal SVG scrolling and stacked readout cards

Original graphics are internally consistent railway teaching symbols, **not
certified international or infrastructure-manager-approved diagrams**.

## Extending the template

Register another authored lesson and a scenario pack; reuse track, train,
sensor, signal, balise, RBC, DMI and timeline components. Behaviour stays in
a pure model; drawing belongs in the renderer; animation belongs in an
interpolation layer. Review every new effect for scope overlap with a
pre-existing lesson engine and add clear training/requirements provenance.

Validation commands:

    node --test tests/simulator-world.test.js tests/topics.test.js tests/authored.test.js
    npm run build

Passing CI demonstrates software integrity, not railway functional safety.
