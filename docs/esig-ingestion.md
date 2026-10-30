# ESIG: ETCS/ERTMS evidence ingestion and simulation rule boundaries

ESIG is the versioned **source evidence registry** for TrainSim. It ingests the full nine-volume
ERTMS/ETCS System Requirements Specification **SUBSET-026 issue 4.0.0 (5 July 2023)**.
It is not a validated signalling implementation or a substitute for independent railway safety assurance.

## Correct ETCS level terminology

Issue `4.0.0` means **Baseline 4 Release 1**, not "ETCS Level 4".
Chapter 2 §§2.6.3–2.6.6 defines application levels **0, NTC, 1, 2**;
§2.6.7 is intentionally deleted (former Level 3). Do not create a fictional Level 4.
The ingestion covers **all nine chapters**, not only those applying to a chosen level.
Keep `etcsLevel`, `etcsMode`, `etcsSystemVersion` and `srsIssue` independent.

## Repository layout

| Path | Purpose |
| --- | --- |
| `data/esig/catalog/subset-026-4.0.0.json` | Pinned nine-volume manifest with 848 source pages and original SHA256 hashes |
| `data/esig/catalog/application-levels.json` | Versioned level vocabulary, with non-existent levels explicitly excluded |
| `data/esig/sources/subset-026/4.0.0/` | Local original PDFs **not committed**; the existing nine filenames must match the manifest |
| `db/esig/schema.sql` | Official source-evidence schema |
| `db/corpus/schema.sql` | Isolated corpus, source snapshots and local interpretations |
| `db/simworld/schema.sql` | Fictitious runtime instances and parameter overrides |
| `scripts/esig/ingest.py` | All-page source extraction, clause candidates, visual artifacts, Chapter 9 classification |
| `scripts/esig/verify.py` | Manifest, pages, database integrity, extraction-presence checks |
| `scripts/esig/seed_example.py` | Optional draft rule and synthetic GA/SA seed; never production compliant |
| `data/esig/examples/` | Synthetic scenario contracts, **not official SUBSET-076 test cases** |
| `data/esig/esig.sqlite` | Generated local database, excluded from Git |
| `data/esig/reports/` | Generated audit report, excluded from Git |

## Run from repository root

Requires `python3`, `pdfinfo` and `pdftotext` (Poppler).
Copy your nine ORIGINAL PDFs to `data/esig/sources/subset-026/4.0.0/`.
For example:

```bash
mkdir -p data/esig/sources/subset-026/4.0.0
cp "/path/to/SUBSET-026-"*' v400.pdf' data/esig/sources/subset-026/4.0.0/
python3 scripts/esig/ingest.py
python3 scripts/esig/verify.py
# Optional synthetic example, not a GOLD rule:
python3 scripts/esig/seed_example.py
# Or: npm run ingest:etcs ; npm run check:etcs
```

Inputs are checked by name, SHA256 and exact PDF page count. Hash changes fail closed
unless explicitly passed `--allow-modified-sources` (records a provenance warning).
The database is replaced atomically after an all-volume extraction succeeds.
Never commit original PDF files or runtime databases without separately agreeing licensing,
storage and provenance handling.

## Exactly what is extracted

- **Every PDF page**, including the entire Chapter 9 classification (not a silent skip);
  page text and checksum stored in `source_page`.
- **Numbered clause candidates**, with start/end pages and occurrences so duplicates are not
  overwritten. Page spans remain candidate-only; tables, nested bullets and footnotes may need
  manual segmentation.
- **Chapter 9 classification rows**, their original line text and optional provisional
  on-board/trackside/definition/informative/other columns, calibrated from each page header.
  Unresolved rows remain `needs_column_review`. Classification may apply to tables without
  a literal "shall".
- **Figure/table/appendix/protocol markers**, pointing back to original PDF pages.
  The original PDFs remain authoritative for diagrams, formula glyphs, table cells and layouts.
- **9 source hashes**, publication date, issue, extraction counts and warnings.

Not guaranteed by text extraction: complete graphical diagrams, equation formatting,
multi-cell alignment, numbered subclauses inside figures, visual table semantics, or
complete protocol bit layouts. Each page starts `needs_visual_review=1`; extraction
**does not** mark clauses, source artifacts, classifications or executable rules verified.
Chapter 9 category coverage must be reconciled before any GOLD promotion.

For exact page imagery use the pinned source PDF with Poppler:
`pdftoppm -f 48 -l 48 -singlefile -scale-to 1600 -png "SUBSET-026-4 v400.pdf" /tmp/mode-transitions`.
The original Figure/Table is more authoritative than extracted text alignment.

## Source boundaries (do not collapse these)

- `document` + `source_page`: immutable evidence linked to exact SHA and page number.
- `clause`, `classification_row`, `source_artifact`: **unverified** extraction candidates.
- `terminology`, `component_type`, `component_interface`, `protocol_element`: domain
  vocabulary and typed interface contracts; official labels remain unchanged (e.g. `NID_BG`).
- `rule` + `rule_evidence` + `rule_relation`: controlled, **reviewed interpretation**
  of multiple clauses, exceptions and requirements, scoped to a version.
- `network_config` (GA), `scenario` (SA), `sim_run`, `sim_event`, `verdict`:
  configuration and test records; derived from rules but never the upstream evidence itself.

### General Arrangement (GA)

TrainSim's GA is an internal contract for directed track topology, detection sections,
signals and interlockings, balise groups, radio coverage, RBC areas, level transition
boundaries, static profiles, gradients and train/consist data. Map geometry is not a
validated signalling layout; require provenance and unresolved-device flags.

### Scenario / Acceptance (SA)

TrainSim's SA describes the initial state, stimuli (driver, TMS, RBC, balise, faults),
event ordering and expected assertions with exact source references. Record seed, engine
commit, ruleset hash and full event trace for reproducibility. The sample in
`data/esig/examples/mixed-l0-l2-no-ma.json` is a synthetic L0 to L2 negative test based
on §5.10.3.2.3; it is **not** an official SUBSET-076 scenario and is not executed by the
current demo simulator.

### Trust / promotion model

`official source PDF -> extracted evidence -> human-reviewed interpretation ->
versioned implementation -> independently checked scenario -> verdict`

Never mark a waived or unexecuted test as passed. GOLD promotion requires exact source
traceability; reconciled Chapter 9 on-board/trackside classification; relevant
cross-references and compatibility exceptions (Chapter 6); an explicit applicability
matrix across level, mode and version; protocol field verification; and positive,
negative and fault-injection tests. The checker confirms **ingestion integrity only**.

## TrainSim integration

For module folders, function filenames and JSON metadata requirements feeding the
web-app catalogue, see [Signalling implementation requirements](sigreqs/README.md).
`npm run ingest:functional` populates the isolated corpus and publishes a SimWorld snapshot with authored function contracts, source-catalogue
expectations and draft synthetic GA/SA records without creating extracted evidence.
See [database ingestion](docs-app.md#populated-database-tables) for the table mapping.

Preserve existing module ownership: ESIG source and executable rules are inputs to
`SimSpec`; `BaseModels` defines component types; `SimWorld` holds deployed
infrastructure/trains; `SimScene` defines stimuli; `SimRun` must evolve into
deterministic rule-led execution; `SimStates` must record evidence and replay.
`SimAdaptor` remains display-only. The current midpoint-balise compiler and
kinematic warnings remain **synthetic**, not ETCS implementations.

The complete TMS and interlocking behaviours cannot be obtained solely from SUBSET-026:
Chapter 1 §1.5.1.4 excludes operational interoperability; Chapter 2 §2.4.1.3(d)
identifies interlockings and control centres as external. Integrate official operational
rules, infrastructure engineering standards and SUBSET-076 test cases as separately
versioned sources before claiming operational fidelity.
