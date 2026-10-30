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
