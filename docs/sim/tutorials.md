# SimWorld Tutorials — paper and ink design contract

**Status:** executable instructional prototypes, **not** signalling safety simulations and **not** certified ETCS behaviour.

## Getting started

From the normal TrainSim checkout run `npm run build && npm start`, then visit
`http://127.0.0.1:3000/#/tutorials?lesson=ma`. The **Tutorials** tab is included
in the existing top navigation and uses no additional runtime dependencies.
All lesson fixtures, Mermaid sources, SVG layouts, I/O labels, reader rows, test
scenarios and state transitions ship in this repository. There are no external
assets or HTTP requests on the tutorial route.

## Components and reusable design system

The image reference establishes the theme, not fixed box positions. Scoped styles
live in `public/tutorials.css` and use prefix `paper-` exclusively so the other
TrainSim Map / Data / Query / Docs screens retain their existing styling.

- `paper-book`: warm paper grain and ruled-jotter background, red left margin.
- `paper-card`, `paper-diagram`, `paper-speedline-box`: ink-bordered cards, offset
  pen shadows, light textured paper. All graphs have both a paper panel border
  and individual hand-drawn-style SVG ink strokes.
- `paper-title-row`, `paper-lesson-picker`, `paper-arrows`: the **Lesson 01** label
  is a hover-discoverable and click-toggle catalogue. Clicking outside, Escape,
  or leaving the menu closes it. The `‹ ›` arrows sit immediately after the
  function title and cycle through all registered lessons. Hash URLs preserve the
  lesson selection for sharing and browser history.
- `paper-action`, `paper-click-flash`, `paper-alarm-button`: all meaningful button
  interactions produce persistent readable feedback in a live status region and
  a visual trigger. Hazard actions use red ink-burst rays. Healthy train movement
  uses the green animated `paper-speedline-box`; green feedback never implies
  proof of an actual safety system.
- `paper-input-grid`, `paper-toggles`, `paper-table`, `paper-facts`,
  `paper-metrics`, `paper-log`, `paper-scenario-list`: reusable source-linked
  inputs/outputs, measured readings and deterministic event log.
- `paper-reader`: consistent handheld shape across lessons. It receives exactly
  the **same `lessonSnapshot(state)` object** as desktop metrics and is always
  labelled as fictitious teaching values. No separate reader-side calculation.
- `paper-mermaid-source`: each graph shows an offline SVG visual and a *verbatim
  Mermaid source* disclosure. Animations highlight the SVG corresponding to the
  present step. No CDN, heavyweight Mermaid package or HTML injection required.

**Responsive behaviour:** 3-column desktop, 2-column tablet, 1-column mobile.
Keyboard focus, screen-reader labels, `aria-live` feedback and reduced-motion
media queries are included. The `paper-` design tokens can be extracted into a
cross-app theme later; this PR scopes them to Tutorials to avoid regressions.

## Versioned self-contained lesson registry

`src/client/tutorials/lessons.js` defines each lesson and its runtime fixtures:

```js
{
  id, number, title, short, goal, summary, boundary, source,
  inputs: [{id,label,kind,default,from,min,max,unit}],
  actions: [{id,label,tone,help}],
  diagrams: {flow /* Mermaid */,state /* Mermaid */,actors,arrows,stages},
  scenarios: [{id,label,kind,steps:[{action}|{set}],expect}]
}
```

Lesson files are local, source-version-referenced **teaching inputs**, not queried
from the official PDF/source DB or from operational SimWorld production tables.
The full corpus-style test cases are included in the registry. The engine in
`src/client/tutorials/engine.js` is a pure deterministic reducer; `stepLesson`
and `lessonSnapshot` can run under Node independently of the UI. A future corpus
build may copy *reviewed* source-seeded examples into this registry, preserving
explicit provenance and implementation/acceptance status. Never silently
promote the instructional model to verified signalling fidelity.

### Lesson 01 — Movement Authority

References: uploaded SUBSET-026-3 v4.0.0 §3.8.1.1; SUBSET-026-8 v4.0.0
§8.7.2. The lesson distinguishes the **EOA** at 0 km/h target speed from the
**LOA** at nonzero end speed; a separately shown current permitted speed of
40 km/h is not the target speed at EOA. Example: front 300 m, MA end 900 m,
remaining authority 600 m, target at EOA 0 km/h, permitted 40 km/h. The reader
reflects those values without duplicating the calculation.

For a denied input, a new MA is withheld. When a section becomes occupied or
radio is lost **after** an MA has already been sent, the tutorial flags review
and prevents further simulated movement; it **does not assert automatic
revocation**, which would require more complete protocol and national rules.

### Lesson 02 — Interlocking route proving

Synthetic route R_AB: point detection, occupancy, overlap, flank and conflicts
are independently toggleable. Route release requires demonstrated train
clearance. Approach occupancy blocks cancellation. This is a **principle-only**
interlocking model, not a site control table or an actual SIL system.

### Lesson 03 — Radio session and train position

Synthetic radio-bearer availability and ETCS version compatibility gate a
session; position report is a second, independent step. The last position
report persists as historical evidence when the bearer drops. No Euroradio
security or formal session timeout implementation is claimed.

## Test harness

```bash
node --test tests/tutorials.test.js
npm run check
```

The new tests verify registry completeness, source links, scenario expectations,
EOA/LOA semantics, handheld/desktop projection equality, stale MA candidate
isolation, authority-bounded movement, conflict and flank refusal, approach
locking, radio loss and input validation. An in-browser visual check remains
necessary to validate the aesthetic across breakpoints. CI/offline Node tests
are **not** certification or proof of SUBSET-076 conformance.

## Extending the catalogue

Add a new lesson object to `LESSONS` with field descriptions, source issue and
section numbers, diagram source and SVG actor positions, scenario action steps,
expected results and negative tests. Add a pure engine reducer case and a
`lessonSnapshot` projection. Reuse the shared UI; do not create per-lesson
handheld displays or fork the CSS. Preserve a visible explicit limitation when
a source or scenario is incomplete. Keep `src/client/tutorials` free of network
calls so tutorial playback can run entirely offline after the normal app loads.

## Complete ESIG curriculum extension

See [ESIG Learning Series](esig-learning-series.md) for the nine-chapter source map, 19 modules,
figure coverage register and Simple / Medium / Busy scenario semantics. The original three
hand-tuned lessons remain the first learning labs; source-indexed lessons extend that
registry without changing the paper-and-ink design contract.

A searchable, grouped lesson catalogue is available from the **Lesson XX ▾** title control.
You can search by clause identifier, function, module, source Figure number or caption.
The tier controls in the page title switch among the scenario fixtures. A Busy fixture
uses multiple same-tick input vectors, fault injection, and explicit recovery, with the
log showing event ticks. Figure choices use locally generated instructional sketches,
never copied source figure raster images. The handheld is always a projection of the
same immutable runtime state as the page facts and outputs.

## Individually authored ESIG function wave 01

There are now **15 authored teaching labs** (three original featured labs plus twelve distinct, source-anchored functions) and **305 source-indexed scaffolds**. The lesson index prioritises authored labs; expand the clearly labelled scaffold catalogue to explore the remainder. Search opens the catalogue automatically.

The twelve new models have dedicated input guards, source-specific outputs and processing effects, and two deterministic fixtures each for **Simple**, **Medium** and **Busy**, including multi-source fault bursts and explicit recovery. All twelve are educational, not complete SUBSET-026 conformance implementations. See [authored wave 01](authored-learning-wave.md) for the detailed clause-by-clause fit/gap table, source boundaries, test cases and recommended upgrade path.

The total registry is **320 entries**, but only **15** are individually authored. Displaying a source-indexed scaffold does not mean a normative ETCS algorithm has been implemented.


## Railway Topics — reusable train / trackside legend

The **Topics ▾** picker sits beside Lesson selection on the Tutorials screen.
Each title opens a dedicated topic page, with a **‹ Back to Lesson** button in
the top-left. The lesson number and reducer state are preserved when navigating
back. Deep links use the hash route #/tutorials?lesson=ma&topic=overview and
optional &component=balise; the default lesson screen remains unchanged.

This is a *perspective* on the existing lessons, **not** another signalling
state machine. Eight topic perspectives cover railway anatomy, balise groups,
LRBG and positioning, safe radio/RBC, Movement Authority (EOA/LOA), external
interlocking, driver display, and level/mode concepts.

### Data path and source responsibility

- **topics.js** holds visual component catalogue, SRS clause anchors, topic
  membership and reusable synthetic railway layout. It reads existing lesson
  sources, lesson source figures, COURSE_META and the named-export metadata
  record in docs/sigreqs/sim-run/level-transitions/. That record is marked
  draft and does not establish implemented requirements.
- **buildTopicScene(lesson, state, lessonSnapshot(state), topicId)** is the
  single pure projection used by the topic diagram and mock DMI. Lesson inputs
  control known train-front position, authority end and target speed. An
  expectedAt input repositions the second balise fixture for balise-link lessons.
  No rendered SVG element stores a separate source-of-truth measurement.
- **topic-diagram.js** renders a DOM/SVG scene with a stable 0–1100-metre
  teaching axis, nominal 130-metre train body and three example balise groups.
  The same landmarks recur in every topic; geometry expands only when a lesson
  input exceeds the normal range. Clicking or keyboard selecting a component
  opens the same definition as selecting its legend.
- **topic-view.js** draws the legend, source/definition inspector, source list
  and train driver **DMI teaching mock**. DMI consumes current lesson inputs
  and state projection. Unknown actual speed, permitted speed, operating mode
  or authority end is shown as *not supplied* rather than fabricated.
- **Simulate lesson loop**, **Step**, and **Reset** reuse the existing lesson
  createLessonState / stepLesson / lessonSnapshot functions and the first
  available normal scenario. First MA lesson demonstrates issue → move → move,
  including passing the second balise group. Simulation repeats while playing,
  stops when navigating away, and honours reduced-motion preferences. Train
  movement is interpolated between state positions; no new signalling rules.

**Interpretation guardrails:** blue dashed MA is a proposal; solid green MA is
an issued teaching-state range. The shaded range begins at the displayed train
front, not a claim about a formal MA section start. A red marker indicates EOA
for zero end target speed, LOA otherwise. DMI layout, radio mast, signals,
points, train appearance, timings and repeated balise positions are fictitious
explanatory graphics. The highlighted preceding balise is an educational
shorthand, not a normative LRBG-selection algorithm. Interlocking rules are
external to SUBSET-026 Chapter 2 and remain synthetic.

### Extending Topics without reinventing simulation

A new reviewed JS requirement record or lesson concept can add a definition
and source references to RAIL_COMPONENTS; topic membership picks visibility.
Physical geometry changes belong in DEFAULT_RAIL_LAYOUT or explicit
lesson-scoped scene inputs, **not** bespoke SVG branches. New behaviour
belongs in an appropriate lesson engine with independent tests, never a Topics
render function. For official-spec fidelity, obtain technical review and add
traceable clause-to-rule evidence before claiming operational simulation.

Validation: node --test tests/topics.test.js tests/tutorials.test.js
tests/authored.test.js tests/esig-curriculum.test.js; npm run build.
