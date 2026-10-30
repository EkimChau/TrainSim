-- Official source evidence only. Local corpus and runtime state live in separate databases.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS source_artifact (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, page_no INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('figure','table','equation','appendix','protocol_element','unclassified')),
 caption_or_anchor TEXT NOT NULL, extraction_state TEXT NOT NULL DEFAULT 'needs_review',
 FOREIGN KEY(document_id,page_no) REFERENCES source_page(document_id,page_no)
);
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
CREATE TABLE IF NOT EXISTS protocol_element (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document(id),
 clause_id TEXT REFERENCES clause(id), element_kind TEXT NOT NULL,
 official_name TEXT NOT NULL, element_no INTEGER, direction TEXT,
 raw_definition TEXT NOT NULL, field_layout_json TEXT,
 review_state TEXT NOT NULL DEFAULT 'extracted_unverified'
);
CREATE TABLE IF NOT EXISTS ingestion_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, imported_utc TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL, page_count INTEGER NOT NULL,
 clause_candidates INTEGER NOT NULL, classification_rows INTEGER NOT NULL,
 artifact_candidates INTEGER NOT NULL, warnings_json TEXT NOT NULL
);
INSERT INTO schema_info VALUES('natural_keys','all') ON CONFLICT(key) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_esig_clause_no ON clause(clause_no);
