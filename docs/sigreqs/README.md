# TrainSim signalling implementation requirements

This page defines the implementation documentation contract for `docs/sigreqs/`.
It builds on [ESIG ingestion](../esig-ingestion.md) and
[module ownership](../architecture.md). The `.js` records feed the app's Docs
catalogue. See [running and ingestion](../docs-app.md) for commands and supported
formats. Loading documentation does not implement signalling behavior.

## Folder branches and ownership

Use `docs/sigreqs/<module>/<capability>/<function-name>-sig-<refcode>.js`.
Here, branching means the folder hierarchy, independent of the Git branch.
Use lowercase kebab-case for every folder, function slug and reference code.
Create capability folders when their first record is added; avoid empty placeholders.

```text
docs/sigreqs/
  README.md
  sim-spec/
    level-transitions/
      compile-level-transition-sig-subset-026-4-0-0-5-10-3-2-3.js
  base-models/
    component-interfaces/
  sim-world/
    train-state/
  sim-scene/
    level-transitions/
  sim-run/
    level-transitions/
      evaluate-level-entry-sig-subset-026-4-0-0-5-10-3-2-3.js
  sim-states/
    decision-traces/
  sim-adaptor/
    requirement-inspector/
```

The tree illustrates the module structure; only the SimRun example currently has
a requirement record. Other folders are created when their first record is added.

| Folder | Module | Implementation requirements belong here when they describe |
| --- | --- | --- |
| `sim-spec` | SimSpec | Compiling reviewed rules and source references into GA configuration |
| `base-models` | BaseModels | Component types, state contracts and typed interfaces |
| `sim-world` | SimWorld | Deployed infrastructure, trains and authoritative world state |
| `sim-scene` | SimScene | Initial conditions, stimuli and SA assertions |
| `sim-run` | SimRun | Deterministic guards, transitions and effects |
| `sim-states` | SimStates | Events, decision evidence, replay and verdict records |
| `sim-adaptor` | SimAdaptor | Displaying requirement metadata and simulation outcomes |

Choose one owning module for each function. Link other modules through record IDs;
do not duplicate a function's requirement record into several folders. SimAdaptor
must not make signalling decisions. Module names are architectural ownership labels;
use actual repository paths in implementation pointers, even where no corresponding
module directory exists yet.

## File naming and identity

The requested `<function-name>-sig-refcode.js` convention expands to
`<function-name>-sig-<refcode>.js`: `sig` is literal, and `refcode` is replaced
with a source-qualified reference.

For SUBSET-026, form the reference as
`subset-026-<issue-with-hyphens>-<clause-with-hyphens>`.
For example, issue `4.0.0`, clause `5.10.3.2.3` becomes
`subset-026-4-0-0-5-10-3-2-3`.
Keep the original dotted clause number and exact ESIG clause ID in metadata;
the filename is a readable label, not an evidence database key.

Use one file per function and primary requirement reference. A function serving
several clauses lists all of them in `requirements`, with exactly one marked
`primary`. Several functions may serve the same clause, using distinct function
slugs. Use a separately registered source namespace and issue for national or
engineering requirements. For an internal simulation assumption, use
`internal-<stable-requirement-id>` and identify its origin as `sim_assumption`;
never assign it an official clause number.

Give each record a globally unique, stable `id`. Moving a file does not change its
ID. Changes to behavior, evidence or applicability increment `revision`. A source
issue change creates a new source-qualified record ID and filename, with a
`supersedes` relation to the earlier record; preserve historical records for replay.

## JavaScript and JSON contract

Each file must export `metadata` as a named ESM export. Its value must be a
JSON-compatible object: strings, finite numbers, booleans, arrays, objects and
`null` only. No functions, dates, undefined values or circular objects belong in
metadata. The same file may export the implementation as a named function when
implemented. Importing a record must have no side effects, IO or simulation steps.

The following is the **draft documentation example** ingested from
`sim-run/level-transitions/evaluate-level-entry-sig-subset-026-4-0-0-5-10-3-2-3.js`, based on the existing
[synthetic scenario](../../data/esig/examples/mixed-l0-l2-no-ma.json).
It does not implement or verify the cited clause. Unresolved evidence fields are
explicitly `null`, rather than invented page numbers or hashes.

```js
// sim-run/level-transitions/evaluate-level-entry-sig-subset-026-4-0-0-5-10-3-2-3.js
export const metadata = {
  "schemaVersion": 1,
  "id": "sim-run.evaluate-level-entry.subset-026-4-0-0-5-10-3-2-3",
  "revision": 1,
  "module": "SimRun",
  "capability": "level-transitions",
  "functionName": "evaluateLevelEntry",
  "functionSlug": "evaluate-level-entry",
  "title": "Evaluate Level 0 to Level 2 entry",
  "purpose": "Describe the decision when entry lacks the necessary movement authority or track description.",
  "origin": "official_interpretation",
  "status": "draft",
  "relationships": {
    "parentId": null,
    "childrenIds": [],
    "dependsOnIds": [],
    "exceptionToIds": [],
    "supersedesIds": []
  },
  "requirements": [
    {
      "refcode": "subset-026-4-0-0-5-10-3-2-3",
      "primary": true,
      "documentId": "SUBSET-026-5@4.0.0",
      "srsIssue": "4.0.0",
      "clauseNo": "5.10.3.2.3",
      "clauseId": "SUBSET-026-5@4.0.0:5.10.3.2.3:1",
      "role": "normative_basis",
      "implementationRequirement": "At the transition border, evaluate the required Level 2 entry data and specify the resulting trip decision when either item is missing.",
      "sourceSha256": null,
      "startPage": null,
      "endPage": null,
      "classificationRowIds": [],
      "classificationReview": "pending",
      "visualReview": "pending"
    }
  ],
  "applicability": {
    "srsIssue": "4.0.0",
    "etcsLevels": ["0", "2"],
    "etcsModes": [],
    "etcsSystemVersions": [],
    "reviewState": "pending"
  },
  "contract": {
    "inputs": ["transitionBorderCrossed", "validLevel2Ma", "level2TrackDescriptionReceived"],
    "preconditions": ["Transition from Level 0 to Level 2"],
    "outputs": ["decision with triggering requirement IDs"],
    "stateChanges": ["Proposed trip decision; exact effect requires review"],
    "failureBehavior": "Reject missing or invalid input explicitly; never assume entry is permitted.",
    "determinism": "Same explicit inputs and ruleset revision produce the same decision."
  },
  "implementation": {
    "state": "not_implemented",
    "path": null,
    "exportName": null,
    "ruleId": "ESIG-DEMO-L0-L2-ENTRY",
    "ruleRevision": 1
  },
  "acceptance": [
    {
      "id": "missing-entry-data",
      "kind": "negative",
      "given": "An L0 to L2 transition with either required entry item missing",
      "when": "The train crosses the transition border",
      "then": "A trip decision cites the requirement and evaluated inputs",
      "testPath": null,
      "result": "not_run"
    }
  ],
  "review": {
    "reviewedBy": null,
    "reviewedAt": null,
    "unresolved": ["Resolve source hash and page span", "Reconcile Chapter 9 classification", "Review related clauses 5.10.3.2.1 and 5.10.3.2.2", "Review Chapter 6 exceptions, mode and system-version applicability"]
  }
};
```

All top-level fields in the example are required. Empty relationship arrays mean
no relationship is declared; empty mode/version arrays mean **unresolved**, not
universal applicability. `parentId` is `null` for a root function. Otherwise it
references another record's ID. Parent/child links must be reciprocal, resolve
to known records and form an acyclic hierarchy. Dependencies and exceptions are
separate directed relationships; they must never imply parent ownership.

`requirements` must contain at least one requirement with a concrete implementation
obligation. Add entries for dependencies, exceptions and supporting evidence with
their appropriate `role`; one entry alone must not imply complete clause coverage.
Every acceptance item needs a stable ID, kind (`positive`, `negative` or `fault`),
given/when/then description, test pointer and actual result. Unexecuted tests remain
`not_run`; track waivers separately from passing results.

## Implementation detail requirements

Before implementing a function, document its typed input/output shapes, units,
valid ranges, guard ordering, state changes, errors, timing and event ordering
in `contract`. The example's string lists are an initial outline; replace them
with explicit structured field contracts as the function is specified. Preserve
official protocol field names, such as `NID_BG`. Include boundary conditions,
related clauses and compatibility exceptions, and record unresolved decisions.

Keep pure decision functions independent of DOM, maps, network access and wall
clock time. Pass simulation time, world state and configuration explicitly.
Use implementation states `not_implemented`, `implemented` or `retired` and record
the actual file path and named export once available. An implementation pointer
does not establish verification. Optional executable functions in documentation
records must obey the same module boundaries as code under `src/shared/`.

Use review statuses `draft`, `reviewed`, `verified` and `retired`, consistent with
the ESIG rule lifecycle. A reviewed/verified record must resolve exact document
hash, clause occurrence, PDF page span and Chapter 9 classification evidence from
the ingested registry. The hash and page span must match that registry. Resolve
visual review, applicability and exceptions before verification. Verification also
requires traceable positive, negative and fault tests; GOLD retains all gates in
[the ingestion guide](../esig-ingestion.md#trust--promotion-model).

## Web-app consumption requirements

The build-time catalogue step discovers `docs/sigreqs/**/*.js` requirement
records and ESIG/simulation guides, validates them and emits
`public/assets/docs-catalogue.json` containing metadata, source paths, guide content
and a deterministic catalogue hash. The live `/api/docs` endpoint uses the same
catalogue from the database; the Ingest files action reimports source files.
Validate JSON compatibility before serialization; never silently drop invalid values.
Sort records by ID and revision before hashing. Keep executable exports out of
the JSON payload. The loader statically parses the JSON object following
`export const metadata =`; it never evaluates JavaScript. Keep that object in
strict JSON syntax, with quoted keys and no comments or trailing commas inside
the object. Executable exports elsewhere in the file are ignored by ingestion.

The catalogue validator must reject duplicate IDs, mismatched filenames/refcodes,
unknown modules, invalid statuses, missing required fields, broken relationship
IDs, inconsistent parent/child links and hierarchy cycles. Evidence gaps may remain
in draft records but must block promotion. Validate implementation and test paths
against the repository and evidence references against the pinned ESIG registry.
Catalogue errors must fail the build rather than publish partial records.

The web app should show module/capability navigation, function purpose and contract,
parent/child and dependency links, exact requirement references, implementation
status, review gaps and acceptance results. Support filters for module, source
issue, clause, level, mode and status. Render metadata as text and keep source
links separate from executable actions. Loading this catalogue must not activate
rules in SimRun or promote evidence to verified status.

## Authoring and acceptance checklist

1. Select the owning module and capability; locate the exact ingested evidence.
2. Create the folder and correctly named `.js` record with a stable ID and primary refcode.
3. Describe purpose, parent/child links, requirement obligations and execution contract.
4. Resolve evidence, applicability and exception gaps through review; link actual code and tests.
5. Validate metadata, names, relationships and evidence before generating the JSON catalogue.
6. Confirm the app can navigate the hierarchy and distinguish draft, implemented and verified records.

Run `npm run ingest:docs` to validate these records and generate the catalogue;
`npm run build` also runs that step. ESIG's separate ingestion checks continue to
validate source ingestion integrity. Documentation ingestion does not run acceptance
scenarios or establish compliance.
