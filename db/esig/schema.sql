-- ESIG / SUBSET-026 source-of-truth staging schema, SQLite.
-- This registry stores source evidence; ingestion NEVER marks executable rules verified.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS document (
 id TEXT PRIMARY KEY, subset TEXT NOT NULL, issue TEXT NOT NULL,
 chapter INTEGER NOT NULL CHECK(chapter BETWEEN 1 AND 9),
 title TEXT NOT NULL, publication_date TEXT NOT NULL,
 source_filename TEXT NOT NULL, sha256 TEXT NOT NULL, page_count INTEGER NOT NULL,
 extraction_tool TEXT NOT NULL, UNIQUE(subset,issue)
);
CREATE TABLE IF NOT EXISTS source_page (
 document_id TEXT NOT NULL REFERENCES document(id),
 page_no INTEGER NOT NULL CHECK(page_no>0),
 page_text TEXT NOT NULL, text_sha256 TEXT NOT NULL,
 needs_visual_review INTEGER NOT NULL DEFAULT 1 CHECK(needs_visual_review IN(0,1)),
 PRIMARY KEY(document_id,page_no)
);
CREATE TABLE IF NOT EXISTS clause (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document(id),
 clause_no TEXT NOT NULL, occurrence INTEGER NOT NULL DEFAULT 1,
 start_page INTEGER NOT NULL, end_page INTEGER NOT NULL,
 source_text TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'extracted_unverified',
 UNIQUE(document_id,clause_no,occurrence),
 FOREIGN KEY(document_id,start_page) REFERENCES source_page(document_id,page_no),
 FOREIGN KEY(document_id,end_page) REFERENCES source_page(document_id,page_no)
);
CREATE INDEX IF NOT EXISTS idx_esig_clause_no ON clause(clause_no);
CREATE TABLE IF NOT EXISTS source_artifact (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, page_no INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('figure','table','equation','appendix','protocol_element','unclassified')),
 caption_or_anchor TEXT NOT NULL, extraction_state TEXT NOT NULL DEFAULT 'needs_review',
 FOREIGN KEY(document_id,page_no) REFERENCES source_page(document_id,page_no)
);
-- Chapter 9 is its OWN source and its rows must NOT be discarded.
CREATE TABLE IF NOT EXISTS classification_row (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, page_no INTEGER NOT NULL,
 referenced_clause TEXT NOT NULL, qualifier TEXT NOT NULL DEFAULT '',
 raw_line TEXT NOT NULL, parsing_state TEXT NOT NULL DEFAULT 'parsed_unverified',
 FOREIGN KEY(document_id,page_no) REFERENCES source_page(document_id,page_no)
);
CREATE TABLE IF NOT EXISTS clause_classification (
 classification_row_id TEXT NOT NULL REFERENCES classification_row(id),
 category TEXT NOT NULL CHECK(category IN
 ('onboard_requirement','trackside_requirement','definition','informative','other')),
 PRIMARY KEY(classification_row_id,category)
);
CREATE TABLE IF NOT EXISTS clause_relation (
 from_clause_id TEXT NOT NULL REFERENCES clause(id),
 to_clause_id TEXT NOT NULL REFERENCES clause(id),
 relation TEXT NOT NULL CHECK(relation IN
 ('references','refines','exception_to','replaces','requires','defines','overrides')),
 review_state TEXT NOT NULL DEFAULT 'draft',
 PRIMARY KEY(from_clause_id,to_clause_id,relation)
);
CREATE TABLE IF NOT EXISTS terminology (
 id TEXT PRIMARY KEY, term TEXT NOT NULL, expansion TEXT,
 kind TEXT NOT NULL, definition TEXT, source_clause_id TEXT REFERENCES clause(id),
 review_state TEXT NOT NULL DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS component_type (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL,
 domain TEXT NOT NULL, definition_clause_id TEXT REFERENCES clause(id)
);
CREATE TABLE IF NOT EXISTS component_interface (
 id TEXT PRIMARY KEY, from_component_id TEXT NOT NULL REFERENCES component_type(id),
 to_component_id TEXT NOT NULL REFERENCES component_type(id),
 contract_name TEXT NOT NULL, source_clause_id TEXT REFERENCES clause(id)
);
CREATE TABLE IF NOT EXISTS protocol_element (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document(id),
 clause_id TEXT REFERENCES clause(id), element_kind TEXT NOT NULL,
 official_name TEXT NOT NULL, element_no INTEGER, direction TEXT,
 raw_definition TEXT NOT NULL, field_layout_json TEXT,
 review_state TEXT NOT NULL DEFAULT 'extracted_unverified'
);
CREATE TABLE IF NOT EXISTS rule (
 id TEXT NOT NULL, revision INTEGER NOT NULL,
 name TEXT NOT NULL, ownership_component TEXT REFERENCES component_type(id),
 category TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN
 ('official_interpretation','national_rule','engineering_rule','local_config','sim_assumption')),
 applicability_json TEXT NOT NULL, guard_json TEXT NOT NULL, effect_json TEXT NOT NULL,
 issue TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'draft'
 CHECK(review_state IN ('draft','reviewed','verified','retired')),
 PRIMARY KEY(id,revision)
);
CREATE TABLE IF NOT EXISTS rule_evidence (
 rule_id TEXT NOT NULL, rule_revision INTEGER NOT NULL,
 clause_id TEXT NOT NULL REFERENCES clause(id), evidence_role TEXT NOT NULL,
 PRIMARY KEY(rule_id,rule_revision,clause_id,evidence_role),
 FOREIGN KEY(rule_id,rule_revision) REFERENCES rule(id,revision)
);
CREATE TABLE IF NOT EXISTS rule_relation (
 rule_id TEXT NOT NULL, rule_revision INTEGER NOT NULL,
 other_rule_id TEXT NOT NULL, other_rule_revision INTEGER NOT NULL,
 relation TEXT NOT NULL, PRIMARY KEY(rule_id,rule_revision,other_rule_id,other_rule_revision,relation),
 FOREIGN KEY(rule_id,rule_revision) REFERENCES rule(id,revision),
 FOREIGN KEY(other_rule_id,other_rule_revision) REFERENCES rule(id,revision)
);
CREATE TABLE IF NOT EXISTS network_config (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, baseline TEXT NOT NULL,
 topology_json TEXT NOT NULL, provenance_json TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS scenario (
 id TEXT PRIMARY KEY, network_id TEXT REFERENCES network_config(id),
 source_type TEXT NOT NULL, initial_json TEXT NOT NULL, events_json TEXT NOT NULL,
 expected_json TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS sim_run (
 id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL REFERENCES scenario(id),
 engine_commit TEXT NOT NULL, rule_bundle_sha256 TEXT NOT NULL,
 simulator_seed INTEGER NOT NULL, status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_event (
 run_id TEXT NOT NULL REFERENCES sim_run(id), seq INTEGER NOT NULL,
 simulated_ms INTEGER NOT NULL, component_id TEXT NOT NULL,
 event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
 PRIMARY KEY(run_id,seq)
);
CREATE TABLE IF NOT EXISTS verdict (
 run_id TEXT NOT NULL REFERENCES sim_run(id), check_id TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN ('pass','fail','blocked','not_run')),
 evidence_json TEXT NOT NULL, PRIMARY KEY(run_id,check_id)
);
CREATE TABLE IF NOT EXISTS ingestion_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, imported_utc TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL, page_count INTEGER NOT NULL,
 clause_candidates INTEGER NOT NULL, classification_rows INTEGER NOT NULL,
 artifact_candidates INTEGER NOT NULL, warnings_json TEXT NOT NULL
);
