# ESIG Learning Series — SUBSET-026 Baseline 4 Release 1

**Version:** curriculum 1.0.0, source issue **4.0.0**, source date **5 July 2023**.
**Authority:** nine locally supplied `SUBSET-026-1 ... SUBSET-026-9 v400.pdf` chapters.
**Status:** complete *source-indexed teaching syllabus*, not a completed ETCS conformance test suite or engineering simulator. Exercise values and behaviours are synthetic unless explicitly identified as source-derived terminology. Never infer certified operational or safety behaviour from the lesson models.

## What is complete and what is not

- **Complete document inventory:** all nine source chapters, 316 table-of-contents headings, 116 identified figure labels (112 active, four `Intentionally deleted`), and 66 explicitly numbered Chapter 7 packets. Sections and figures are checked into [esig-learning-index.json](../../public/internet-specs/esig-learning-index.json), with page anchors, source version, coverage state, and lesson IDs.
- **Complete curriculum mapping:** 305 generated concept scaffolds, plus three hand-tuned pilots and twelve individually authored function labs (320 navigable entries, 15 individually authored), arranged into 19 functional modules. A section may map to its own lesson or to its nearest substantive child; deleted/editorial sections are not misrepresented as executable railway functions.
- **Self-contained executable teaching scaffolding:** each generated lesson has typed inputs and their origins, projected outputs, state and system Mermaid source, source-figure selection where relevant, synthetic state changes, two scenarios per level (Simple/Medium/Busy), deterministic event traces, an expected phase, and a handheld reading derived from the identical state projection. The source PDFs, GitHub, network APIs, and third-party code are NOT needed at tutorial runtime.
- **Not complete engineering fidelity:** neither the generic state machines, educational re-expression diagrams, toy stopping-distance math, synthetic input values, nor simplified communication/version guards are transcriptions of the requirements' full normative behaviour. Actual SRS-specific algorithms, precise figure geometry, SUBSET-076 test-case execution, national operational rules, interlocking control tables, supplier-dependent RBC logic, braking safety assessment, and external TMS operations remain **outside this deliverable**. Treat these as **teaching models**, not acceptance evidence.

## Course modules (source-derived chapters and section boundaries)

| Module | Coverage | Purpose |
| --- | --- | --- |
| 01 · Foundations & interoperability | Chapter 1 | SRS scope, what is in/out of the specification, evidence chain |
| 02 · Architecture and levels | Chapter 2 | ETCS trackside/on-board architecture, Level 0/NTC/1/2 |
| 03 · Balises, linking and Euroloop | §3.4 | Balise groups, linking, coordinate direction, infill |
| 04 · Radio communication | §3.5 | Session setup/maintenance/termination, connection status |
| 05 · Location and confidence | §3.6 | LRBG, orientation, position intervals, reports, relocation |
| 06 · Data completeness | §3.7 | Location-based information validity and replacement |
| 07 · Movement Authority | §3.8 | MA structure, EOA/LOA, requests, extension and shortening |
| 08 · Infill and emergency | §§3.9–3.10 | Infill source, emergency stop and revocation |
| 09 · Route/speed/gradient profiles | §§3.11–3.12 | Static, temporary and restrictive speed profile inputs |
| 10 · Braking and supervision | §§3.13–3.14 | MRSP, target, supervision limits, braking/roll-away protection |
| 11 · Special functions | §3.15 | RBC handover, reversing, joining, track ahead free, ATO |
| 12 · Consistency and versions | §§3.16–3.17 | Balise/radio errors and system version selection |
| 13 · National and train data | §§3.18–3.20 | National/default/vehicle data and juridical logging |
| 14 · Modes and transitions | Chapter 4 | Mode definitions, active-function and transition tables |
| 15 · Procedures | Chapter 5 | SoM, EoM, shunting, override, On Sight, Trip, levels, crossing, manoeuvre |
| 16 · Older system versions | Chapter 6 | Version envelopes, trackside compatibility, air-gap data |
| 17 · Language and packets | Chapter 7 | Bit/variable/packet definitions, 66 numbered packet entries |
| 18 · Messages | Chapter 8 | Radio message definitions, directions, validation and exchange |
| 19 · Clause classification | Chapter 9 | Classification metadata and requirements traceability |

Every user-visible lesson is *one primary SRS concept*, even if the underlying packet/figure or subsystem appears in other lessons. Lessons overlap deliberately to compare the same signal from the **OBU**, **RBC**, **balise**, **driver**, **trackside**, **mode**, or **test** perspective.

## Three dataset levels for EVERY lesson

| Mode | Inputs and events | Demonstration | Test expectations |
| --- | --- | --- | --- |
| Simple | Default example values, one normal operation or one fault | What signal is required? What output changes? | A normal evaluation reaches ACTIVE; a missing condition reaches BLOCKED |
| Medium | Parameter variation plus sequential evaluation and two progress events | What happens when the system state or profile changes? | PROGRESS or COMPLETE state with ordered events |
| Busy | 2–3 independent input vectors *at the same logical tick*, repeated evaluations, combined failures and recovery | What happens under concurrent-looking changes and fault cascades? | REVIEW/BLOCKED observed, no silent progression, explicit recovery, deterministic final phase |

**A Busy burst is an ordered event batch sharing one logical tick, not a physically simultaneous or distributed-safe transaction.** This distinction is visible in the scenario event log.

All numeric examples (e.g., speed 60 km/h, permitted speed 80 km/h, 0.9 m/s², 4 s build-up time, position uncertainty 12 m) are **synthetic test data**. The named terms, chapter titles, caption labels and clause/page reference are derived from the supplied SRS. The simplified `v²/(2a) + v*t` braking example is not the ETCS brake model or a safe stopping guarantee.

## How each sourced diagram is taught

1. The source figure is identified by **chapter, figure number, caption and printed page**. All active figure IDs are mapped to a source concept lesson. Deleted figures are retained as intentionally deleted, never rendered as working functions.
2. The lesson offers the *source-specific caption* with an illustrated, interactive diagram category (track/position, supervision/curve, message/packet, or state/flow). The diagram changes its highlight according to the lesson's state.
3. The two machine-readable Mermaid blocks show **who provides which input** and the tutorial's own states. These are *authored educational flows*, not copies of the normative figure.
4. Changing the inputs or running a fixture changes the desktop outputs and the handheld from **one state projection**. Inputs and derived output are shown with units and origins.
5. Any teaching interpretation that is not specified by the SRS remains flagged as a model assumption. A figure-to-lesson link is **coverage of teaching intent**; it is NOT conformance with that figure's detailed requirement.

## Acceptance gate and reproducibility

From a normal TrainSim checkout:

```bash
node --test tests/tutorials.test.js tests/esig-curriculum.test.js tests/tutorials-ui.test.js
npm run build
npm start
# open http://127.0.0.1:3000/#/tutorials?lesson=ma
```

Offline metadata reconstruction if the nine authoritative chapter PDFs are locally available:

```bash
python3 scripts/tutorials/generate_course.py /path/to/source-pdfs
```

The generated `course-source.js` and figure/index JSON are committed so the browser never depends on the user's PDFs or online reference APIs. The generator does not copy or rehost upstream figures or substantive text. It deliberately extracts only section names, figure labels, packet names and source-page identifiers.

The test harness verifies all 305 generated lessons × 6 scenarios = **1,830 generated scenario executions**, with deterministic replay and expected phases, every indexed active figure link, typed inputs and licence-safe source metadata. The three original pilot lessons and the twelve individually authored labs have their own source-specific replay and functional-boundary tests. See [authored ESIG wave 01](authored-learning-wave.md).

## What to implement before any fidelity claim

The next assurance wave must replace each *illustrative family engine* with properly sourced, clause-by-clause implementations, not simply turn off the `teaching_abstraction` flag. At a minimum it needs:

- Level/mode transition matrices actually derived from Chapter 4 tables, not a generic eligibility gate.
- Real position confidence and relocation algorithms rather than a single ± distance example.
- Message/packet encoders and decoders with bit lengths, validity direction, field conditions and cross-message correlation from Chapters 7–8.
- Brake supervision calculations and parameter sources from §§3.11–3.14, not the toy equation.
- Actual procedure step/timeout/acknowledgement logic from Chapter 5, with SRS clause-level tests.
- SUBSET-076 mapped test IDs, result evidence and negative-case coverage.
- Selected national operational rules, TMS interfaces and the interlocking principles/site-specific control table, which SUBSET-026 excludes (§1.5.1.4, §2.4.1.3(d)).

A synthetic scenario can be functionally complete as a training exercise without being a complete, certified train-control implementation.
