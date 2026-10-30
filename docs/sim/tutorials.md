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