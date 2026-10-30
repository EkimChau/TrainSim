# Docs app and file ingestion

Run `npm run build`, then `npm start`, and open
[Sim Docs](http://127.0.0.1:3000/#/docs). The Sim Docs tab is independent of the
selected database and works without an ingested world database.

## Inputs and refresh

Sim Docs reads `docs/esig-ingestion.md`, Markdown under `docs/sigreqs/` and
`docs/sim/`, and requirement `.js` files under
`docs/sigreqs/<module>/<capability>/`. ESIG source JSON under `data/esig/catalog/`
and synthetic scenarios under `data/esig/examples/` provide the data pages.
The separate README tab reads the root `readme.md` and other repository guides
(including architecture, OSM ingestion and this tooling guide). It skips binary files such as the
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

`ingest:docs` validates the whole catalogue and atomically writes the generated
`public/assets/docs-catalogue.json` snapshot. `build` runs ingestion before bundling.
Generated assets are excluded from Git. A validation failure stops the build.

The running app reads current files through `GET /api/docs`; choose **Reload files**
to ingest edits without restarting. This endpoint returns the same catalogue shape
as the generated snapshot: `schemaVersion`, `documents`, `records`, `datasets`,
`modules`, `repositoryLinks`, `warnings`, and `hash`. `repositoryLinks` contains
only guide IDs/titles for cross-tab links, not repository guide content.
`GET /api/readme` serves repository guides independently of requirement validation.
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

Markdown headings, paragraphs, lists, fenced code, tables, inline code, bold text
and links are rendered as DOM text. Raw HTML is displayed as text. External links
are limited to HTTP(S); local guide links stay inside Docs. Unsupported Markdown
formatting remains readable as text.

## Evidence and validation

The loader checks names, IDs, field types, references, reciprocal parent/child
links, hierarchy cycles and repository implementation/test paths. It checks
evidence against `data/esig/esig.sqlite` when available, using a read-only
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
