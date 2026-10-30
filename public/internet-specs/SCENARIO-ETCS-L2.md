# SCN-EU-L2-001 — one traversable ETCS Level 2 movement (candidate, NOT certified)

**Scenario edition:** 0.1.0 / 2026-10-30. **Jurisdiction:** hypothetical EU mainline, **not** a particular commissioned site. **Technical baseline:** ETCS Baseline 4 Release 1, SRS 4.0.0. **Operational baseline:** EU OPE TSI 2019/773 Appendix A v6 (with amendments). **Test baseline:** SUBSET-076 4.0.0, **test IDs not yet extracted**. **Engineering illustration:** Indian Railways CAMTECH handbook v1.0 for interlocking test concepts only (separate national context).

## Diagram

```
TMS planned train/path (TEL TSI) -> dispatcher route request
       |                                |
       v                                v
Train + DMI/OBU <--- radio ---- RBC <--- safety-boundary --- Interlocking
       |                         ^                              |
       +--- balise/odom ---------+                   points, track circuits,
       |                                             flank & overlap locking
       +---------------- physical track / occupancy -----------------------+
```

> RBC and interlocking are **distinct** safety components. A TMS timetable or route intention must NEVER issue a movement authority directly. The RBC may grant movement authority only from independently assured, route-constrained trackside inputs. An illustrative interlocking 'route proved' Boolean alone is not enough in a real design.

## Minimal model (synthetic, explicit)

- Stations A and B, one direction, line speed and train data configured separately.
- Signals/ETCS Stop Markers A0 and B0; four detection sections T01–T04; one point P1 and a conflicting branch route R_CONFLICT. Separate locked overlap O1.
- One train TRAIN_001 with OBU, train position, length, safe front/rear and braking capability. One RBC R1. One interlocking IXL1. One signaller/TMS command interface.
- Only one synthetic demonstration line. **No claim of survey-accurate topology, calibrated speed, certified braking curve, valid production keys or live train control.**

## Event script and acceptance evidence

| Step | Actor / stimulus | Expected state or invariant | Main evidence | Gate |
|---|---|---|---|---|
| 01 | TMS creates path for TRAIN_001 and schedules A→B | Path proposed; no route or authority issued from timetable alone | TEL TSI 2026/253; OPE TSI | candidate |
| 02 | Dispatcher requests R_AB; track circuits report clear | IXL evaluates point detection P1, all route sections, overlap/flank and active conflicts | national approved control table (MISSING); CAMTECH testing concept | design gap |
| 03 | IXL establishes and locks R_AB | Deny R_CONFLICT, prove P1 locked, inhibit unsafe change, deny train authority on failed proving | CAMTECH route/overlap/point/conflict tests | conceptual |
| 04 | OBU initialises start of mission and radio session | Position/identity version checks; defined mode transition, radio session reports | SUBSET-026 ch 3–5, 7–8; SUBSET-037 | candidate |
| 05 | OBU receives/reads valid balise group | Location reference updated with confidence interval; mismatched linkage handled per SRS | SUBSET-026 §3.4/3.6; SUBSET-036 | candidate |
| 06 | RBC accepts position and safely established route boundary | MA cannot extend beyond proven protected EOA or onto conflict; valid speed/gradient data | SUBSET-026 §3.8/7/8; SUBSET-040, ERA/ERTMS/033281 | design gap |
| 07 | RBC sends MA; OBU enters or remains in allowed mode | MA parsed; FS supervision and DMI only when all SRS conditions satisfied | SUBSET-026 ch3–5/7–8; ERA DMI | candidate |
| 08 | Train advances, T01–T04 occupy/release in sequence | Occupancy never licenses conflicting movement; route retains approach and route locking until permitted release | CAMTECH interlocking tests; site rules MISSING | design gap |
| 09 | TMS records delay/ETA as train advances | Timetable may update forecast; never overrides RBC/IXL constraints | TEL TSI 2026/253 | candidate |
| 10 | An opposing train requests R_CONFLICT during movement | Conflicting route refused; no movement authority for conflict | interlocking control table (MISSING) | design gap |
| 11 | Train reaches EOA safely at B; movement ends | OBU respects supervision, handles end of mission; MA withdrawn/released per defined procedures | SUBSET-026 §5.5, §3.8, operational rules | candidate |
| 12 | After train proved clear and release conditions met | IXL may release route sections and then allow another route | CAMTECH sectional route release; site control table MISSING | design gap |

## Negative/failure tests required to call this one functioning demonstrator

1. Switch P1 commanded but not proven: route cannot clear and RBC cannot grant MA for it.
2. Detection section T02 occupied or failed: route not established; no conflicting MA.
3. Opposing / conflicting route requested: deny even when the TMS timetable says it is due.
4. Overlap or flank condition fails: no route establishment.
5. Communications interruption or RBC reject: OBU reacts according to defined mode and national operation, not assumed 'continue'.
6. Movement authority expires or is shortened: OBU updates supervision; EOA must never be exceeded.
7. Balise misread / position uncertainty grows: OBU reacts to SRS conditions and raises observable state.
8. Driver emergency stop / train trip, restart under proper authority: test OBU and operational procedure independently.
9. No silent reset of approach locking or occupied route release.
10. Trace every test to a **specific actual SUBSET-076 case ID after extracting the official archives**; otherwise mark 'not mapped'.

## No-false-fidelity acceptance conditions

This file is a **testable product requirements contract**, not a complete acceptance proof. A runnable demonstrator is achieved only when:

- train position/dynamics, track topology, route table, sections, train detection, balise, radio, RBC, OBU, IXL and TMS are independently modelled and interconnected;
- every change is deterministic/event logged with causal order; conflicting route/MA safety invariants are enforced in code;
- no actor can bypass the IXL→RBC→OBU safety chain; 
- tests exercise real simulator implementation and compare expected vs observed results;
- selected country-specific operating rules and route-control tables are separately pinned;
- compiled binaries/configurations, simulator inputs, test output and source document hashes are reproducible;
- official SUBSET-076 test case mapping has verified IDs, applicability, and coverage;
- conformance/certification remains **UNCLAIMED**, unless backed by competent accredited assessment of the actual implementation.

## Material yet to obtain before claiming operational completeness

**Critical:** approved site-specific signalling plans, interlocking control table, national signalling principles/overlap rules, controller–interlocking interface design, route setting and sectional release, infrastructure manager's operational rules, national values, equipment-specific data, radio/cryptographic provisioning, calibration and proof of compliance. These data are not provided by SUBSET-026 or by OSM/GTFS.

**TMS:** 2026/253 defines data exchanges, many open points remain, and no single official public document defines a universally certified traffic manager including algorithms, dispatcher UI and degraded recovery. Select one operator/procurement profile and build a separately versioned requirement set.
