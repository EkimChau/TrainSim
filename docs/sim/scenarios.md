# Scenario and acceptance data

Sim Docs ingests synthetic scenario files from `data/esig/examples/*.json` and
renders their source references, general arrangement (GA), initial state,
stimuli and expected assertions. These pages describe test contracts; opening
one does not execute the scenario or generate a verdict.

## General arrangement

GA describes directed nodes and edges, distances, level boundaries and relevant
infrastructure such as RBC areas. Synthetic IDs and geometry must retain their
synthetic provenance. Missing devices and unreviewed assumptions must remain
explicit rather than being treated as validated infrastructure.

## Scenario inputs

SA supplies initial train state, stimuli ordered in simulation time, and expected
assertions. Specify units and ordering for events with the same timestamp.
Invalid or absent required inputs must produce an explicit result instead of
silently granting a permissive state.

The current mixed Level 0 to Level 2 example describes crossing a level boundary
without the required movement authority or track description. Its trip assertion
is a draft interpretation linked to SUBSET-026 clauses 5.10.3.2.1–5.10.3.2.3.
It is not an official SUBSET-076 test or an implemented ETCS function.

## Reproducible future execution

Record the engine commit, ruleset hash, scenario/GA revision, random seed if used,
and complete ordered input/event trace. Assertions need exact source lineage and
actual outcomes. An unexecuted assertion stays `not_run`; a waiver is not a pass.
Positive, negative and injected-fault cases are required before rule verification.

Use [module interfaces](modules.md) for ownership and
[ESIG promotion requirements](../esig-ingestion.md#trust--promotion-model) for
the evidence and review gates.
