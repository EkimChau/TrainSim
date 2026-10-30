# Official railway specifications library (research references, not certification)

**Source snapshot researched:** 2026-10-30. **Reference profile:** a synthetic European ETCS Level 2 journey using Baseline 4 Release 1. **TrainSim status:** illustrative / unverified / not safety related.

This directory is intentionally separated from [SUBSET-026 ingestion](../../docs/esig-ingestion.md). SUBSET-026 chapter 1 §1.5.1.4 excludes operational interoperability, and chapter 2 §2.4.1.3(d) leaves interlockings and control centres external. Hence **do not** claim TMS or interlocking fidelity by implementing SUBSET-026 alone.

## Files and source control

- [catalog.json](catalog.json) and [sources.csv](sources.csv): 43 separately versioned, official/reference records. Each document has an authority, scope, issue, source URL, expected download URL where discovered, status and integration priority.
- [fetch_specs.py](fetch_specs.py): standard-library downloader; checks actual PDF/ZIP signatures, checks ZIP CRC, records SHA-256, handles transient rate-limits, refuses unexpected redirects.
- [SCENARIO-ETCS-L2.md](SCENARIO-ETCS-L2.md): one contiguous demonstration from path planning through an interlocked route, RBC authority, OBU supervision and release, with explicitly identified gaps.
- [check_catalog.py](check_catalog.py): local catalogue and URL sanity checks.
- `downloads/` and `download-lock.json`: intentionally **not tracked** until each source's redistribution rights have been checked.

The catalogue is a **curated publication/version index**, **not** a certificate of conformance, proof of a complete national installation, or a claim that these materials can be freely rehosted.

## Complete or near-complete example datasets (new)

We have also identified **18 runnable, substantially complete, or research-grade railway scenario datasets**, separately catalogued from regulations and standards:

- [Scenario selection, examples and fit/gap matrix](SCENARIO-DATASETS.md)
- [Tabular scenario dataset inventory](scenario-datasets.csv)
- [Machine-readable scenario dataset catalogue](scenario-datasets.json)
- [Defensive local downloader](fetch_datasets.py) and [validation script](check_datasets.py)
- [Two actually imported OSM Interlocking configuration datasets](dataset-seeds/osmhpi/README.md) — exact copied Git blobs with GPLv3 licence and provenance.

The strongest complementary sources are **OSMHPI Interlocking** (executable train route logic), **OSRD small_infra** (70 routes / 106 signals / 17 points), **SBB MATSim** (stations, flat crossings, grade separation, reversing, block policies and operational demand), **DISPLIB** (delay recovery/dispatch) and **railML** (formal route/overlap/track-vacancy definitions). This gives multiple **functionally complete scenarios within their own subsystem boundaries** without falsely claiming an end-to-end production ETCS deployment. Third-party content beyond the two explicitly GPL-licensed seed configuration JSON files is referenced or fetched locally, not committed.

```bash
python3 public/internet-specs/check_datasets.py
python3 public/internet-specs/fetch_datasets.py --list
python3 public/internet-specs/fetch_datasets.py --id OSRD-SMALL-INFRA
python3 public/internet-specs/fetch_datasets.py --id SBB-UC2 --id DISPLIB-NOR
```

## Download and validate

From repository root:

```bash
python3 public/internet-specs/check_catalog.py
python3 public/internet-specs/fetch_specs.py --list
python3 public/internet-specs/fetch_specs.py --priority core
# All archived SUBSET-076-6-3 segments are substantial; explicitly opt in:
python3 public/internet-specs/fetch_specs.py --all
# Or fetch one item:
python3 public/internet-specs/fetch_specs.py --id SUBSET-076-7 --id SUBSET-040
# Import the nine already supplied chapters from a local directory:
python3 public/internet-specs/fetch_specs.py --id OPE-TSI-APP-A-V6 --seed-local /path/to/uploaded/pdfs
```

The last example selects a reference-only item to avoid another network transfer while seeding local PDFs. This downloader **must be run in a network-enabled workspace**. It was written and catalogued remotely, but binaries have not been downloaded/validated by this environment and are not committed here.

## Requirements and evidence hierarchy

1. **Legal & operational (normative in the EU):** current CCS TSI 2023/1695; OPE TSI 2019/773 Appendix A (version 6) and interface with non-harmonised local rules; TEL TSI 2026/253 (supersedes earlier TAP/TAF).
2. **ETCS technical specifications:** ERA approved Baseline 4 Release 1 SUBSET-026 plus SUBSET-034/036/037/039/040/091/098, etc. ETCS technical compatibility only, not a national interlocking design.
3. **Conformance tests:** SUBSET-076-5-2, 076-6-3 **13 ZIP parts**, 076-7; SUBSET-094 reference test facility. Tests cover the on-board equipment, not TMS/interlocking end to end.
4. **Interlocking engineering reference:** official Indian Railways CAMTECH handbook, September 2021, which includes control tables, route proving, conflicting routes, locking, FAT/SAT and negative tests. **Not EU legislation and not an approved logic table for an EU ETCS site.**
5. **Queensland context:** QLD MRTS333/MRS333 are construction/specification documents; MRTS333 explicitly points to Queensland Rail's separate technical documentation. The SEQ OpenStreetMap/GTFS simulator cannot infer vital signalling logic from public mapping data.
6. **CENELEC assurance reference metadata:** EN 50126-1/-2 (2017+A1:2024), EN 50716:2023 (supersedes older EN 50128/50657), EN 50129:2026 and EN 50159:2026. These licensed standards are **reference-only**; do not copy previews or paywalled texts into this public repository.\n7. **Separate design inputs:** selected station signalling plan, actual route control table, asset layout, points/crossings and overlaps, detection sections, braking parameters, radio/keys, national values, valid infrastructure data, TMS configuration, operating rules and certified implementation evidence. None can be fabricated and labelled official.

## Capability / gap matrix

| Boundary | Published source | Needed for one end-to-end simulator scenario | Not supplied by the published source |
|---|---|---|---|
| Train path / timetable / disruptions | 2026/253 TEL TSI; 2019/773 OPE TSI | timetable, train ID, path rights, conflict requests, delay events | proprietary dispatch optimiser, real infrastructure data |
| Local operator / signaller / driver | OPE TSI Appendix A v6 | communication, start/end of movement, degraded procedures | IM/RU local rulebook, operating notices |
| Interlocking | Indian CAMTECH handbook + local national rules | points proven, track sections clear, flank/overlap protection, approach locking, conflict denial | actual approved site control table and national approval |
| ETCS trackside / RBC | SUBSET-026, 039, 040, 098 | RBC session, train position, route-derived authority limits, MA updates, stop / trip | RBC internal vendor implementation, IXL↔RBC protocol |
| Balises / train detection | SUBSET-036, 085, ERA/ERTMS/033281 | balise groups, position reference, occupancy update | actual installation drawings, train detection hardware configuration |
| Communication/security | SUBSET-037 and 092, key management sources | radio session and integrity for test-mode messages | cryptographic credentials, production RMR network |
| OBU / driver | SUBSET-026, 034, ERA DMI | SoM, modes FS/SR/TR, speed supervision, braking and DMI | certified vehicle/OBU and dynamics |
| Test facility and cases | SUBSET-076 4.0.0; SUBSET-094 | trace stimulus, OBU responses, expected state and conformance verdict | IXL/TMS end-to-end certification; an executed test run |

## Key compatibility warnings

- **Do not cross-mix Baseline 3 and Baseline 4 messages**, or merge national interlocking rules into the harmonised OPE rules, without an explicit compatibility profile.
- **Source approval ≠ implemented ≠ tested ≠ safety-assessed ≠ certified.** Use separate lifecycle labels.
- The Indian Railways interlocking handbook is used for **testing technique** only in the European synthetic scenario. It does not impose Indian locking and operating conventions on the EU model.
- TEL TSI 2026/253 identifies open points (including some traffic-management data exchanges), not a complete interoperable TMS algorithm. This library therefore does **not** claim full TMS functional coverage.
- The ERA SUBSET-076 test sets are hosted as ZIPs. A ZIP can be downloaded and integrity-checked, but any mapping of specific test-case identifiers must come from extracted actual content, not guesses.
- Review licences before copying upstream copyrighted PDF/ZIP documents into a public git repository. See source owners' terms. A link from an official site is not automatically a right to republish.

## Publication and legal verification anchors

- ERA official mandatory Baseline 4 R1 specifications: https://www.era.europa.eu/era-folder/1-ccs-tsi-appendix-mandatory-specifications-etcs-b4-r1-rmr-gsm-r-b1-mr1-frmcs-b0-ato-b1
- EU CCS TSI, current consolidated: https://eur-lex.europa.eu/eli/reg_impl/2023/1695/2026-05-05/eng
- OPE TSI and Appendix A: https://eur-lex.europa.eu/eli/reg_impl/2019/773/2025-03-31/eng
- TEL TSI 2026/253: https://eur-lex.europa.eu/eli/reg_impl/2026/253/oj/eng
- Indian Railways CAMTECH: https://rdso.indianrailways.gov.in/uploads/Handbook%20on%20Interlocking%20%26%20Functional%20Testing%20of%20PI%20RRI%20EI_September%202021.pdf
- Queensland TMR: https://www.tmr.qld.gov.au/business-industry/technical-standards-publications/specifications/6-rail-and-other

**Next gate:** fetch all required archives in a networked checkout; validate complete file byte hashes; inspect full SUBSET-076 testcase IDs; define a specific authority/route control table; and only then promote individual scenario assertions from `candidate` to `evidence-backed`.
