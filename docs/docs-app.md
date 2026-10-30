# Docs app and file ingestion

Run `npm run build`, then `npm start`, and open
[TrainSim Docs](http://127.0.0.1:3000/#/docs). The unified Docs tab is independent of the
selected database and works without an ingested world database.

## Inputs and refresh

Docs reads the root `readme.md`, all Markdown guides under `docs/`, and
requirement `.js` files under
`docs/sigreqs/<module>/<capability>/`. ESIG source JSON under `data/esig/catalog/`
and synthetic scenarios under `data/esig/examples/` provide the data pages.
Repository, ESIG and simulation guides share one navigation tree. The root README
opens by default; Overview shows data and implementation counts. It skips binary files such as the
station spreadsheet and rejects symlinks in the documentation tree.
See the [requirement contract](sigreqs/README.md) for naming and metadata fields.

Each requirement must contain `export const metadata = { ... };` with a strict
JSON object literal. Imports, functions and any other JavaScript are never executed
by the loader. Keep metadata self-contained; computed expressions, imported data,
comments inside the JSON object and trailing commas are unsupported.

```bash
npm run ingest:docs
npm run build
npm start
```

`ingest:docs` / `ingest:functional` validate the catalogue, import it into the isolated corpus
database in one transaction and publish a SimWorld reference snapshot, and atomically write the generated
`public/assets/docs-catalogue.json` snapshot. `build` runs ingestion before bundling.
Generated assets are excluded from Git. A validation failure stops the build.

The running app reads the persisted catalogue through `GET /api/docs` from SimWorld; choose
**Refresh references** (`POST /api/docs/ingest`) to import edits without restarting.
A failed import preserves the previously stored catalogue. This endpoint returns the same catalogue shape
as the generated snapshot: `schemaVersion`, `documents`, `records`, `datasets`,
`modules`, `repositoryLinks`, `warnings`, `hash`, and `storage`. The storage summary
reports database location, import time, extraction counts and missing prerequisites.
Old `#/readme` links redirect into Docs.
Invalid input returns an error instead of a partial catalogue.
The snapshot is a build/export artifact; the Docs UI uses the live API.

## Browsing

Search covers guide content and requirement metadata, including clause numbers.
Filters select module, capability, review status, source issue, level and mode;
applying a requirement filter hides guides. Empty mode/version lists remain
unresolved and do not match a specific mode. Clear filters restores all files.

The overview shows authored/implemented/verified counts and module pages. Source
data pages show pinned volume hashes and application-level vocabulary; scenario
pages show GA topology, initial state, stimuli and expected assertions. No scenario
is executed by loading its page. The requirement detail shows purpose, source clauses, parent/child relationships,
dependencies, applicability, execution contracts, implementation pointers and
acceptance results. Draft evidence gaps remain visible. Links to guides and
requirements preserve the selected document in the URL for bookmarking.

## Populated database tables

`functional_source` records exact file hashes. `functional_module`,
`functional_function`, `functional_requirement` and `functional_relation` store
authored function contracts, obligations and relationship IDs. Unresolved clause
references retain `expected_clause_id`; `resolved_clause_id` is nullable until the
source clause is actually extracted. Importing a function does not create a rule.

`functional_document` and `source_catalogue` retain guide content and JSON inputs.
`source_volume_expectation` stores the nine manifest entries as expectations,
and `application_level` retains both defined and explicitly excluded levels.
These are not evidence `document` or `source_page` records.

Synthetic GA/SA inputs populate `network_config` and `scenario` with draft status.
Reviewed scenarios are protected from overwrite. Repeated imports upsert stable
keys; prior function revisions remain available with an active/inactive flag.
`functional_catalogue` holds the current validated app snapshot. Inspect these
tables through the SimWorld snapshot in Data or Query. The isolated corpus is
`data/corpus/corpus.sqlite`; official source evidence stays in `data/esig/esig.sqlite`.

Full evidence extraction still requires all nine original SHA-pinned PDFs,
`pdfinfo` and `pdftotext`. Run `npm run ingest:etcs` when those inputs exist; this
runs full extraction and then reimports the functional records. Source refreshes
preserve schema-known relational data when source hashes match, while replacing
the extracted staging records atomically. Direct Python invocations must
also be followed by `npm run ingest:functional`. Never fabricate source pages,
classification rows or passing verdicts to fill an unavailable source.

The [technical corpus](sim/technical-corpus.md) adds source-derived variable values,
protocol fields, component I/O signatures and parameter provenance. Generated
`corpus-id:` identifiers are local; source standards and references remain distinct.

Markdown headings, paragraphs, lists, fenced code, tables, inline code, bold text
and links are rendered as DOM text. Raw HTML is displayed as text. External links
are limited to HTTP(S); local guide links stay inside Docs. Unsupported Markdown
formatting remains readable as text.

## Evidence and validation

The loader checks names, IDs, field types, references, reciprocal parent/child
links, hierarchy cycles and repository implementation/test paths. It checks
evidence against the pinned corpus source snapshot when available, using a read-only
connection. Missing source evidence is a warning for drafts and blocks promotion
to reviewed/verified status. Existing ESIG evidence is not rewritten.

The catalogue hash covers sorted, canonical metadata, guide content and warnings.
It changes when documentation or the evidence reconciliation result changes;
it is not a simulation ruleset hash. The loader checks declared test results and
file existence but does not execute acceptance tests or independently certify
review claims. The initial L0/L2 record remains draft and unimplemented.

## Checks

`node --test tests/docs.test.js` exercises ingestion, validation, graph integrity,
filters and live API refresh. `npm run check` runs the full project suite and build.
