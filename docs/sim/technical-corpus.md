# Technical corpus and standard provenance

Generated local identifiers use `corpus-id:<kind>:<digest>`. They are not official
standard, clause, packet, message or variable identifiers. Official names such as
`NID_MESSAGE`, packet 15, clause `7.4.2.4` and SUBSET-026 issue `4.0.0` remain
unchanged in their own source-reference fields. The digest is deterministic for a
record identity; it does not mean the record has been reviewed.

## Always identify the source

Every technical corpus reference joins through `technical_reference_trace` to:

- The standard and issue, source volume and immutable document ID.
- The original PDF filename, SHA256, publication date and PDF page span.
- The clause number, occurrence and exact clause record ID.
- The parser SHA256, component mapping SHA256 and input-source fingerprint.

Parameters have two distinct sources where available: the message/packet that
uses the field and the variable definition that specifies its width or values.
`component_io_parameter_provenance` exposes both. Do not replace a missing variable
definition with the enclosing message's source identity. An unresolved reference
remains unresolved.

External labels such as SUBSET-034 and SUBSET-037 are retained in
`technical_external_reference` with their citing clause and `source_not_ingested`
status. Their editions and contents are not inferred from the SUBSET-026 issue.
Manufacturer-specific specifications are not supplied by the current source set.

## Relational technical data

| Tables | Stored data |
| --- | --- |
| `technical_clause_reference` | Potential clause citations, source offsets and exact/ambiguous/unresolved targets |
| `classification_clause_reference` | Chapter 9 rows linked to clause candidates without declaring classification reviewed |
| `technical_variable`, `technical_value` | Source bit widths, minimum/maximum strings, resolutions and special/reserved code meanings |
| `protocol_field`, `protocol_packet_reference` | Packet/message field order, variable links, packet alternatives and original layout text |
| `component_type`, `component_evidence`, `component_interface` | Component mappings and source-anchored directional interfaces |
| `component_io_function`, `component_io_parameter` | Send/receive signatures derived from radio-message layouts |
| `functional_parameter`, `functional_parameter_evidence` | Authored function inputs/outputs and their requirement context |
| `scenario_initial_value`, `scenario_evidence` | Synthetic input values and assertion references, kept distinct from normative variable definitions |
| `technical_parse_run`, `technical_reference_parse` | Reproducible parser/input fingerprints linked to corpus records |

The component mapping file is
`data/esig/contracts/subset-026-components-4.0.0.json`. Its interpretation is draft.
Components identified only in an architecture figure carry `architecture_figure`
evidence, which is not a full device specification.

## Function contracts for Level 2 work

Radio-message tables produce separate send/input and receive/output signatures.
Their trackside endpoint remains generic, reflecting the source's train/track
direction. Binding that endpoint to an RBC in a Level 2 profile requires reviewed
configuration. Source messages are not all automatically applicable to every mode,
level or system version.

Bit widths and code meanings are parsed from the source. Distances retain their
source units and `Q_SCALE` dependency; no numeric operating defaults are invented.
Repeated fields, packet alternatives, optional fields and dynamic length formulas
retain their original text and review state. A parsed field count does not establish
complete binary-layout coverage.

Generated functions have `implementation_state='contract_only'`. They are signatures
for subsequent implementation and validation. No automatic source parser supplies
braking, interlocking or movement-authority decision logic. Reviewed rules, complete
component specifications and scenario validation are required for execution.

## Parse, ingest and inspect

`npm run ingest:etcs` re-extracts all nine pinned PDFs and then imports authored and
technical data. Source refreshes preserve schema-known relational tables when the
source hashes are identical. Changed source identities require a separate staging
database. Candidate technical tables are rebuilt deterministically; reviewed rules
and evidence links remain separate.

`npm run ingest:functional` refreshes the technical corpus from the extracted
database, function metadata, component mapping and scenario files. The import is
transactional and keeps foreign-key integrity. It never promotes parsed contracts.

Open **Docs → Technical corpus** to search. Every detail page displays the standard,
issue, source hash, clause and pages. The read-only API is:

```text
GET /api/docs/technical?kind=io-function&standard=SUBSET-026&issue=4.0.0
GET /api/docs/technical?q=Q_SCALE&kind=variable
GET /api/docs/technical?corpusId=<corpus-id>
```

The isolated corpus is `data/corpus/corpus.sqlite`. Running app pages read its
published snapshot in `data/simworld/simworld.sqlite`; official evidence stays in
`data/esig/esig.sqlite`. See [the SimWorld boundary](simworld.md). Use Data or Query
on the SimWorld snapshot for the full relationships. The
catalogue hash describes documentation inputs; the technical parse ID/fingerprints
describe the generated technical corpus. Neither is a verified runtime ruleset hash.
