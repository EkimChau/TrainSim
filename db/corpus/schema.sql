-- Isolated corpus: immutable source snapshots plus local corpus contracts.
CREATE TABLE IF NOT EXISTS corpus_dataset (
 corpus_id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 source_url TEXT NOT NULL, source_version TEXT, licence TEXT NOT NULL,
 metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS corpus_seed_object (
 corpus_id TEXT PRIMARY KEY, dataset_corpus_id TEXT NOT NULL REFERENCES corpus_dataset(corpus_id),
 kind TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT NOT NULL,
 source_sha256 TEXT NOT NULL, values_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS corpus_seed_link (
 from_id TEXT NOT NULL REFERENCES corpus_seed_object(corpus_id), field TEXT NOT NULL, ordinal INTEGER NOT NULL,
 to_id TEXT REFERENCES corpus_seed_object(corpus_id), raw_target TEXT NOT NULL,
 resolution TEXT NOT NULL, PRIMARY KEY(from_id,field,ordinal)
);
-- ESIG / SUBSET-026 source-of-truth staging schema, SQLite.
-- This registry stores source evidence; ingestion NEVER marks executable rules verified.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Schema constraints own identity; allow idempotent upserts through the DB console.
INSERT INTO schema_info VALUES('natural_keys','all') ON CONFLICT(key) DO NOTHING;

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

-- Authored functional contracts and file provenance are separate from extracted evidence.
CREATE TABLE IF NOT EXISTS functional_source (
 source_path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, kind TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS functional_module (
 name TEXT PRIMARY KEY, folder TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS functional_function (
 id TEXT NOT NULL, revision INTEGER NOT NULL, module TEXT NOT NULL REFERENCES functional_module(name),
 capability TEXT NOT NULL, function_name TEXT NOT NULL, title TEXT NOT NULL, purpose TEXT NOT NULL,
 review_state TEXT NOT NULL, implementation_state TEXT NOT NULL,
 source_path TEXT NOT NULL REFERENCES functional_source(source_path), metadata_json TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), PRIMARY KEY(id,revision)
);
CREATE TABLE IF NOT EXISTS functional_requirement (
 function_id TEXT NOT NULL, function_revision INTEGER NOT NULL, refcode TEXT NOT NULL,
 is_primary INTEGER NOT NULL CHECK(is_primary IN (0,1)), obligation TEXT NOT NULL,
 expected_clause_id TEXT, resolved_clause_id TEXT REFERENCES clause(id), evidence_json TEXT NOT NULL,
 PRIMARY KEY(function_id,function_revision,refcode),
 FOREIGN KEY(function_id,function_revision) REFERENCES functional_function(id,revision)
);
CREATE TABLE IF NOT EXISTS functional_relation (
 from_id TEXT NOT NULL, from_revision INTEGER NOT NULL, to_id TEXT NOT NULL, to_revision INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('parent_of','depends_on','exception_to','supersedes')),
 PRIMARY KEY(from_id,from_revision,to_id,to_revision,kind),
 FOREIGN KEY(from_id,from_revision) REFERENCES functional_function(id,revision),
 FOREIGN KEY(to_id,to_revision) REFERENCES functional_function(id,revision)
);
CREATE TABLE IF NOT EXISTS functional_document (
 source_path TEXT PRIMARY KEY REFERENCES functional_source(source_path),
 title TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_catalogue (
 source_path TEXT PRIMARY KEY REFERENCES functional_source(source_path), title TEXT NOT NULL,
 kind TEXT NOT NULL, data_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_volume_expectation (
 catalogue_path TEXT NOT NULL REFERENCES source_catalogue(source_path),
 document_id TEXT NOT NULL, chapter INTEGER NOT NULL, issue TEXT NOT NULL,
 filename TEXT NOT NULL, expected_pages INTEGER NOT NULL, expected_sha256 TEXT NOT NULL,
 PRIMARY KEY(catalogue_path,document_id)
);
CREATE TABLE IF NOT EXISTS application_level (
 catalogue_path TEXT NOT NULL REFERENCES source_catalogue(source_path),
 level_id TEXT NOT NULL, issue TEXT NOT NULL, name TEXT, source_clause TEXT, status TEXT NOT NULL,
 PRIMARY KEY(catalogue_path,level_id)
);
CREATE TABLE IF NOT EXISTS functional_catalogue (
 id TEXT PRIMARY KEY CHECK(id='current'), sha256 TEXT NOT NULL,
 imported_utc TEXT NOT NULL, payload_json TEXT NOT NULL
);

-- Source-derived technical contracts. These remain extraction candidates, not reviewed rules.
CREATE TABLE IF NOT EXISTS technical_reference (
 corpus_id TEXT PRIMARY KEY, kind TEXT NOT NULL, clause_id TEXT NOT NULL REFERENCES clause(id),
 protocol_id TEXT REFERENCES protocol_element(id), description TEXT NOT NULL,
 review_state TEXT NOT NULL DEFAULT 'extracted_unverified' CHECK(review_state='extracted_unverified')
);
CREATE TABLE IF NOT EXISTS technical_clause_reference (
 id TEXT PRIMARY KEY, from_clause_id TEXT NOT NULL REFERENCES clause(id),
 expected_clause_no TEXT NOT NULL, to_clause_id TEXT REFERENCES clause(id),
 raw_reference TEXT NOT NULL, source_offset INTEGER NOT NULL,
 resolution TEXT NOT NULL CHECK(resolution IN ('resolved','unresolved','ambiguous'))
);
CREATE INDEX IF NOT EXISTS technical_clause_reference_target ON technical_clause_reference(to_clause_id);
CREATE TABLE IF NOT EXISTS classification_clause_reference (
 classification_id TEXT NOT NULL REFERENCES classification_row(id), clause_id TEXT NOT NULL REFERENCES clause(id),
 resolution TEXT NOT NULL, PRIMARY KEY(classification_id,clause_id)
);
CREATE TABLE IF NOT EXISTS technical_external_reference (
 id TEXT PRIMARY KEY, clause_id TEXT NOT NULL REFERENCES clause(id), document_label TEXT NOT NULL,
 source_offset INTEGER NOT NULL, raw_reference TEXT NOT NULL,
 resolution TEXT NOT NULL DEFAULT 'source_not_ingested'
);
CREATE TABLE IF NOT EXISTS technical_variable (
 protocol_id TEXT PRIMARY KEY REFERENCES protocol_element(id),
 corpus_id TEXT NOT NULL UNIQUE REFERENCES technical_reference(corpus_id),
 bit_length INTEGER, length_raw TEXT, minimum_raw TEXT, maximum_raw TEXT,
 resolution_raw TEXT, description_raw TEXT NOT NULL,
 parsing_state TEXT NOT NULL CHECK(parsing_state IN ('parsed_candidate','needs_layout_review'))
);
CREATE TABLE IF NOT EXISTS technical_value (
 variable_id TEXT NOT NULL REFERENCES technical_variable(protocol_id), ordinal INTEGER NOT NULL,
 code_raw TEXT NOT NULL, meaning_raw TEXT NOT NULL, raw_line TEXT NOT NULL,
 PRIMARY KEY(variable_id,ordinal)
);
CREATE TABLE IF NOT EXISTS protocol_field (
 owner_protocol_id TEXT NOT NULL REFERENCES protocol_element(id), ordinal INTEGER NOT NULL,
 name_raw TEXT NOT NULL, variable_id TEXT REFERENCES technical_variable(protocol_id),
 bit_length INTEGER, condition_raw TEXT NOT NULL, raw_text TEXT NOT NULL,
 parsing_state TEXT NOT NULL, PRIMARY KEY(owner_protocol_id,ordinal)
);
CREATE TABLE IF NOT EXISTS protocol_packet_reference (
 owner_protocol_id TEXT NOT NULL REFERENCES protocol_element(id), field_ordinal INTEGER NOT NULL,
 packet_no INTEGER NOT NULL, packet_id TEXT REFERENCES protocol_element(id),
 resolution TEXT NOT NULL, raw_reference TEXT NOT NULL,
 PRIMARY KEY(owner_protocol_id,field_ordinal,packet_no),
 FOREIGN KEY(owner_protocol_id,field_ordinal) REFERENCES protocol_field(owner_protocol_id,ordinal)
);
CREATE TABLE IF NOT EXISTS component_evidence (
 component_id TEXT NOT NULL REFERENCES component_type(id), clause_id TEXT NOT NULL REFERENCES clause(id),
 role TEXT NOT NULL, corpus_id TEXT NOT NULL REFERENCES technical_reference(corpus_id),
 PRIMARY KEY(component_id,clause_id)
);
CREATE TABLE IF NOT EXISTS component_io_function (
 id TEXT PRIMARY KEY, corpus_id TEXT NOT NULL REFERENCES technical_reference(corpus_id),
 component_id TEXT NOT NULL REFERENCES component_type(id), peer_component_id TEXT NOT NULL REFERENCES component_type(id),
 interface_id TEXT NOT NULL REFERENCES component_interface(id), protocol_id TEXT NOT NULL REFERENCES protocol_element(id),
 operation TEXT NOT NULL CHECK(operation IN ('send','receive')), function_name TEXT NOT NULL,
 applicability_json TEXT NOT NULL, implementation_state TEXT NOT NULL DEFAULT 'contract_only' CHECK(implementation_state='contract_only')
);
CREATE TABLE IF NOT EXISTS component_io_parameter (
 function_id TEXT NOT NULL REFERENCES component_io_function(id), ordinal INTEGER NOT NULL,
 name TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('input','output')),
 variable_id TEXT REFERENCES technical_variable(protocol_id), bit_length INTEGER,
 presence TEXT NOT NULL CHECK(presence IN ('specified_field','conditional_or_unresolved')),
 source_protocol_id TEXT NOT NULL, source_field_ordinal INTEGER NOT NULL,
 PRIMARY KEY(function_id,ordinal),
 FOREIGN KEY(source_protocol_id,source_field_ordinal) REFERENCES protocol_field(owner_protocol_id,ordinal)
);
CREATE TABLE IF NOT EXISTS functional_parameter (
 function_id TEXT NOT NULL, function_revision INTEGER NOT NULL, direction TEXT NOT NULL,
 ordinal INTEGER NOT NULL, name TEXT NOT NULL, contract_json TEXT NOT NULL,
 expected_variable_name TEXT, variable_id TEXT REFERENCES technical_variable(protocol_id),
 PRIMARY KEY(function_id,function_revision,direction,ordinal),
 FOREIGN KEY(function_id,function_revision) REFERENCES functional_function(id,revision)
);
CREATE TABLE IF NOT EXISTS functional_parameter_evidence (
 function_id TEXT NOT NULL, function_revision INTEGER NOT NULL, direction TEXT NOT NULL, ordinal INTEGER NOT NULL,
 clause_id TEXT NOT NULL REFERENCES clause(id), role TEXT NOT NULL,
 PRIMARY KEY(function_id,function_revision,direction,ordinal,clause_id),
 FOREIGN KEY(function_id,function_revision,direction,ordinal) REFERENCES functional_parameter(function_id,function_revision,direction,ordinal)
);
CREATE TABLE IF NOT EXISTS scenario_evidence (
 scenario_id TEXT NOT NULL REFERENCES scenario(id), clause_id TEXT NOT NULL REFERENCES clause(id),
 role TEXT NOT NULL, PRIMARY KEY(scenario_id,clause_id)
);
CREATE TABLE IF NOT EXISTS scenario_initial_value (
 scenario_id TEXT NOT NULL REFERENCES scenario(id), parameter_name TEXT NOT NULL,
 value_json TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'synthetic_scenario',
 PRIMARY KEY(scenario_id,parameter_name)
);
CREATE TABLE IF NOT EXISTS component_io_parameter_reference (
 function_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
 corpus_id TEXT NOT NULL UNIQUE REFERENCES technical_reference(corpus_id),
 PRIMARY KEY(function_id,ordinal),
 FOREIGN KEY(function_id,ordinal) REFERENCES component_io_parameter(function_id,ordinal)
);
CREATE TABLE IF NOT EXISTS protocol_field_reference (
 protocol_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
 corpus_id TEXT NOT NULL UNIQUE REFERENCES technical_reference(corpus_id),
 PRIMARY KEY(protocol_id,ordinal),
 FOREIGN KEY(protocol_id,ordinal) REFERENCES protocol_field(owner_protocol_id,ordinal)
);
CREATE VIEW IF NOT EXISTS technical_reference_provenance AS
 SELECT r.corpus_id,r.kind,r.description,r.review_state,r.protocol_id,
 c.id AS clause_id,c.clause_no,c.occurrence,c.start_page,c.end_page,
 CASE WHEN d.subset GLOB 'SUBSET-026-*' THEN 'SUBSET-026' ELSE d.subset END AS standard,
 d.subset AS source_volume,d.issue AS standard_issue,d.id AS document_id,
 d.sha256 AS source_sha256,d.source_filename,d.publication_date
 FROM technical_reference r JOIN clause c ON c.id=r.clause_id JOIN document d ON d.id=c.document_id;
CREATE VIEW IF NOT EXISTS component_io_parameter_provenance AS
 SELECT p.*,link.corpus_id,r.standard,r.standard_issue,r.document_id,r.source_sha256,
 r.clause_id,r.clause_no,r.start_page,r.end_page,r.source_filename,
 v.minimum_raw,v.maximum_raw,v.resolution_raw,v.parsing_state AS variable_parsing_state,
 vr.corpus_id AS variable_corpus_id,vr.clause_id AS variable_clause_id,
 vr.standard AS variable_standard,vr.standard_issue AS variable_standard_issue,
 vr.source_sha256 AS variable_source_sha256,vr.start_page AS variable_start_page,vr.end_page AS variable_end_page
 FROM component_io_parameter p
 JOIN component_io_parameter_reference link ON link.function_id=p.function_id AND link.ordinal=p.ordinal
 JOIN technical_reference_provenance r ON r.corpus_id=link.corpus_id
 LEFT JOIN technical_variable v ON v.protocol_id=p.variable_id
 LEFT JOIN technical_reference_provenance vr ON vr.corpus_id=v.corpus_id;
CREATE TABLE IF NOT EXISTS technical_parse_run (
 corpus_id TEXT PRIMARY KEY, parser_sha256 TEXT NOT NULL, mapping_sha256 TEXT,
 source_fingerprint TEXT NOT NULL, generated_utc TEXT NOT NULL, counts_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS technical_reference_parse (
 corpus_id TEXT PRIMARY KEY REFERENCES technical_reference(corpus_id),
 parse_id TEXT NOT NULL REFERENCES technical_parse_run(corpus_id)
);
CREATE VIEW IF NOT EXISTS technical_reference_trace AS
 SELECT r.*,p.corpus_id AS parse_id,p.parser_sha256,p.mapping_sha256,p.source_fingerprint
 FROM technical_reference_provenance r
 JOIN technical_reference_parse link ON link.corpus_id=r.corpus_id
 JOIN technical_parse_run p ON p.corpus_id=link.parse_id;
