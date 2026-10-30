-- Runtime instances are fictitious; source/corpus snapshots are provenance inputs.
CREATE TABLE IF NOT EXISTS simworld_meta (
 key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS simworld_source (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_path TEXT NOT NULL,
 fingerprint TEXT NOT NULL, imported_utc TEXT NOT NULL, details_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS simworld_component (
 id TEXT PRIMARY KEY, component_type_id TEXT NOT NULL REFERENCES component_type(id),
 corpus_id TEXT REFERENCES technical_reference(corpus_id),
 classification TEXT NOT NULL CHECK(classification='fictitious'),
 configuration_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS simworld_contract (
 id TEXT PRIMARY KEY, component_id TEXT NOT NULL REFERENCES simworld_component(id),
 corpus_id TEXT NOT NULL REFERENCES technical_reference(corpus_id),
 configuration_json TEXT NOT NULL, execution_state TEXT NOT NULL CHECK(execution_state='blocked_pending_review')
);
CREATE TABLE IF NOT EXISTS simworld_parameter (
 scenario_id TEXT NOT NULL REFERENCES scenario(id), name TEXT NOT NULL,
 value_json TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification='fictitious'),
 source_path TEXT NOT NULL, PRIMARY KEY(scenario_id,name)
);
CREATE TABLE IF NOT EXISTS simworld_seed_object (
 id TEXT PRIMARY KEY, dataset_corpus_id TEXT NOT NULL REFERENCES corpus_dataset(corpus_id),
 kind TEXT NOT NULL, source_name TEXT NOT NULL, values_json TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification='fictitious')
);
CREATE TABLE IF NOT EXISTS simworld_seed_link (
 from_id TEXT NOT NULL REFERENCES simworld_seed_object(id), field TEXT NOT NULL, ordinal INTEGER NOT NULL,
 to_id TEXT REFERENCES simworld_seed_object(id), raw_target TEXT NOT NULL,
 resolution TEXT NOT NULL, PRIMARY KEY(from_id,field,ordinal)
);
