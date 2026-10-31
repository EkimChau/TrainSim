# ESIG Tutorials: authored function wave 01

**Status:** 12 individually written educational function models and 72 deterministic fixture replays; **not** ETCS implementation conformance. The earlier three pilot labs remain distinct and the 305 SUBSET-026 concept entries are still accessible as **indexed scaffolds**.

## Purpose and source boundaries

The first wave connects the learner's understanding of the following chain: balise information → on-board location confidence → position report → radio/RBC interaction → Start of Mission → route proving boundary → MA → restrictions/gradient → braking → mode conditions → emergency stop → RBC handover. These are independently operable lessons, not an integrated end-to-end SIL-certified train-control system.

Each function reads only its embedded SimWorld fixture. The paper UI, Ink/SVG diagrams and Mermaid source, log, metric boxes and handheld reader share the same projected state. No official/corpus database or internet call is needed for replay.

## Individual lessons and evidence

| Lesson | Function-specific output | Primary SUBSET-026 4.0.0 source | Key negative test | Scope of modelling |
|---|---|---|---|---|
| 04 | Linked BG identity, direction and expectation-window consistency | Chapter 3 §§3.4.4.1–3.4.4.4 | BG ID mismatch / late observation | Half-window is a synthetic assumption; linked reaction only labelled |
| 05 | LRBG confidence min/max safe front | Chapter 3 §3.6.4.1.5 | Missing LRBG | Simplified forward-axis formula including γ-dependent length terms |
| 06 | Report fields, uncertainty, LRBG, orientation, movement and integrity flag | Chapter 3 §3.6.5.1.2 | Missing LRBG or radio session | NOT a packed radio message or SUBSET-076 proof |
| 07 | Network + RBC session readiness, recontact count | Chapter 3 §§3.5.3–3.5.7 | Radio bearer lost / safety layer refusal | No Euroradio authentication or national timers |
| 08 | Selected Stand-By and stored-data statuses for SoM | Chapter 5 §§5.4.1–5.4.3 | Unknown driver status or desk closed | Only selected S0-D7 decision concepts, not full procedure |
| 09 | Route/overlap/point/flank/conflict proof | Chapter 2 §2.4.1.3(d), external IXL engineering | Point failure, opposing route | **Not** specified by SUBSET-026; illustrative IXL boundary only |
| 10 | Proposed MA type EOA vs LOA, extension/shortening boundary | Chapter 3 §§3.8.1–3.8.6 | End behind train, unacknowledged shortening | No Message 3 serialization, timers or cooperative protocol |
| 11 | Point-sampled most restrictive ceiling and separate gradient | Chapter 3 §§3.11–3.12 | Missing profiles/train data | Not spatial MRSP, profile interpolation or braking integration |
| 12 | Toy stopping-distance budget and signed margin | Chapter 3 §3.13.8 | Brake data missing; rising speed lowers margin | Not ETCS piecewise EBD/SBD, warnings or intervention thresholds |
| 13 | Illustrative FS/SR/TR prerequisite comparison | Chapter 4 §§4.4–4.8, transition tables | No MA for toy FS candidate, Trip takes precedence | **Not** normative mode transition matrix |
| 14 | Conditional vs unconditional emergency stop, matching revocation ID | Chapter 3 §§3.10.2–3.10.3 | Already-passed stop point, wrong revoke ID | Does not model full EOA/SvL/LOA/overlap or brake commands |
| 15 | Handing-over → accepting RBC data readiness | Chapter 3 §3.15.1; interfaces separately in SUBSET-039/098 | Accepting RBC not ready / missing train info | No RBC/RBC safe protocol; one-radio-session degradation only labelled |

The named concepts, branching distinctions and (where noted) specific formulas are supported by the supplied chapter PDFs. All default sensor inputs, train speeds, distances and time values are **synthetic** teaching values. The modules are not safety-control components.

## Three tiers per lesson

Each authored function has exactly six fixture scenarios: two Simple, two Medium and two Busy.

- **Simple:** normal accepted inputs and one explicit guard failure.
- **Medium:** two function-specific processing events, plus a variation of that function's inputs. The corresponding evaluation may change an output quantity or selected decision.
- **Busy:** two independent actor changes share an ordered logical tick. The state becomes REVIEW and a re-evaluation can BLOCK; the inputs then restore and the learner must explicitly re-evaluate before further progress. A second fixture begins with failures and models recovery.

The batched events are deterministic *ordered source changes*, not physically simultaneous railway signalling. Visual red and green flashes indicate the tutorial interaction, **not** a real brake or driving instruction.

## Fidelity and quality gates

- Every lesson has a different `authoredRule` and a dedicated evaluator branch with documented I/O and source boundaries.
- Outcomes are checked by tests including source-specific numeric invariants: LRBG interval min/max, EOA/LOA, speed-restriction minimum, toy braking margin, emergency stop and message ID matching, and RBC handover dependencies.
- 72 scripted fixture paths are tested for final phases, ordered logs, REVIEW/BLOCKED observations, deterministic replay, and identical projected desktop/handheld values.
- Existing three pilot labs and all 1,830 generic scaffold replays must remain passing.
- Future engineering fidelity requires clause-by-clause full algorithms, normative mode/procedure tables, actual packets, SUBSET-076 mapping, certified equipment or reviewed safety cases, and site-specific national IXL/TMS operating rules. Until then use 7authored educational function8 rather than 7certified ETCS8.

## Adding an authored lesson

1. Choose a single primary source function and record its exact clauses and exclusions.
2. Add a distinct fixture specification to `src/client/tutorials/authored-lessons.js`.
3. Add a separately evaluated rule and processing effects in `authored-engine.js`; avoid silently inheriting generic scaffold guard logic.
4. Supply two Simple, two Medium and two Busy scenarios with function-specific changes and expected states.
5. Extend `tests/authored.test.js` with invariants for its actual decision or calculation.
6. Verify the indexed/scaffold UI remains clearly labelled and test the full TrainSim client build.

Run `node --test tests/authored.test.js tests/tutorials.test.js tests/esig-curriculum.test.js` and `npm run build` in the repository checkout.