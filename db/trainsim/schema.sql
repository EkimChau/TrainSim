-- TrainSim world database (SQLite 3.38+ with JSON1 and R*Tree; both ship with
-- Python 3.10+ and Node 22's node:sqlite).
--
-- Layers
--   scope_*      stations, lines and connections from docs/stations.xlsx
--   osm_*        lossless raw OpenStreetMap elements (tags as JSON)
--   rail_*       typed railway objects derived from osm_* (OpenRailwayMap layers)
--   topo_*       simulator track graph: nodes, edges, switch legs, linear referencing
--   rtree_*      spatial indexes for viewport queries
--   ingest_run / source_snapshot / coverage   provenance and completeness audit
--
-- Identity and uniqueness rules
--   * Every OSM-derived row is keyed by its OSM id (plus type where ids can collide).
--     Re-running the ingest upserts by that key, so rows are never duplicated.
--   * Rows created by hand in the editor use NEGATIVE ids (JOSM convention).
--     The ingest never deletes or overwrites rows with negative ids.
--   * rail_*, topo_* and rtree_* rows with positive ids are derived data and are
--     rebuilt inside one transaction on every ingest, so they never go stale.
--   * scope_* tables use natural UNIQUE keys (station name, line name).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_info (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO schema_info(key, value) VALUES ('schema_version', '2'), ('natural_keys', 'all')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
-- natural_keys=all tells the database console that every table here already has a
-- natural or OSM key, so it must not add its generic duplicate-payload triggers.

-- ---------------------------------------------------------------- provenance
CREATE TABLE IF NOT EXISTS ingest_run (
  run_id        INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  source        TEXT NOT NULL CHECK (source IN ('overpass', 'file', 'pbf', 'geofabrik')),
  source_detail TEXT,
  scope_json    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  stats_json    TEXT,
  UNIQUE (started_at, source)
);

CREATE TABLE IF NOT EXISTS source_snapshot (
  sha256        TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  elements      INTEGER NOT NULL,
  osm_timestamp TEXT,
  first_run_id  INTEGER NOT NULL REFERENCES ingest_run(run_id),
  last_run_id   INTEGER NOT NULL REFERENCES ingest_run(run_id)
);

CREATE TABLE IF NOT EXISTS coverage (
  run_id      INTEGER NOT NULL REFERENCES ingest_run(run_id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,
  numerator   INTEGER NOT NULL,
  denominator INTEGER,
  note        TEXT,
  PRIMARY KEY (run_id, metric)
);

-- ---------------------------------------------------------------- QR EMU fleet
CREATE TABLE IF NOT EXISTS rail_emu_train (
  train_id       TEXT PRIMARY KEY,
  engine_type    TEXT NOT NULL DEFAULT 'QR EMU',
  skin           TEXT NOT NULL CHECK (skin IN ('3a', '3b')),
  carriage_count INTEGER NOT NULL DEFAULT 3 CHECK (carriage_count IN (3, 6))
);
INSERT OR IGNORE INTO rail_emu_train(train_id, engine_type, skin, carriage_count) VALUES
  ('QR-EMU-01', 'QR EMU', '3a', 3),
  ('QR-EMU-02', 'QR EMU', '3b', 3),
  ('QR-EMU-03', 'QR EMU', '3a', 3),
  ('QR-EMU-04', 'QR EMU', '3b', 3),
  ('QR-EMU-05', 'QR EMU', '3a', 3),
  ('QR-EMU-06', 'QR EMU', '3b', 3);

-- -------------------------------------------------------------- Translink GTFS
CREATE TABLE IF NOT EXISTS translink_feed (
  feed_id       INTEGER PRIMARY KEY CHECK (feed_id = 1),
  source_url    TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  feed_start    TEXT NOT NULL,
  feed_end      TEXT NOT NULL,
  attribution   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translink_route (
  route_id       TEXT PRIMARY KEY,
  short_name     TEXT,
  long_name      TEXT,
  description    TEXT,
  route_type     INTEGER NOT NULL CHECK (route_type = 2),
  url            TEXT,
  colour         TEXT,
  text_colour    TEXT
);

CREATE TABLE IF NOT EXISTS translink_service (
  service_id TEXT PRIMARY KEY,
  monday     INTEGER NOT NULL CHECK (monday IN (0, 1)),
  tuesday    INTEGER NOT NULL CHECK (tuesday IN (0, 1)),
  wednesday  INTEGER NOT NULL CHECK (wednesday IN (0, 1)),
  thursday   INTEGER NOT NULL CHECK (thursday IN (0, 1)),
  friday     INTEGER NOT NULL CHECK (friday IN (0, 1)),
  saturday   INTEGER NOT NULL CHECK (saturday IN (0, 1)),
  sunday     INTEGER NOT NULL CHECK (sunday IN (0, 1)),
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translink_service_date (
  service_id     TEXT NOT NULL REFERENCES translink_service(service_id) ON DELETE CASCADE,
  service_date   TEXT NOT NULL,
  exception_type INTEGER NOT NULL CHECK (exception_type IN (1, 2)),
  PRIMARY KEY (service_id, service_date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS translink_stop (
  stop_id       TEXT PRIMARY KEY,
  stop_code     TEXT,
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  parent_station TEXT,
  platform_code TEXT
);

CREATE TABLE IF NOT EXISTS translink_trip (
  trip_id      TEXT PRIMARY KEY,
  route_id     TEXT NOT NULL REFERENCES translink_route(route_id),
  service_id   TEXT NOT NULL REFERENCES translink_service(service_id),
  headsign     TEXT,
  direction_id INTEGER,
  shape_id     TEXT NOT NULL,
  train_id     TEXT NOT NULL REFERENCES rail_emu_train(train_id)
);
CREATE INDEX IF NOT EXISTS translink_trip_service ON translink_trip(service_id, route_id);
CREATE INDEX IF NOT EXISTS translink_trip_shape ON translink_trip(shape_id);

CREATE TABLE IF NOT EXISTS translink_stop_time (
  trip_id          TEXT NOT NULL REFERENCES translink_trip(trip_id) ON DELETE CASCADE,
  stop_sequence    INTEGER NOT NULL,
  stop_id          TEXT NOT NULL REFERENCES translink_stop(stop_id),
  arrival_seconds  INTEGER NOT NULL,
  departure_seconds INTEGER NOT NULL,
  PRIMARY KEY (trip_id, stop_sequence)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS translink_stop_time_stop ON translink_stop_time(stop_id);

CREATE TABLE IF NOT EXISTS translink_shape_point (
  shape_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  lat      REAL NOT NULL,
  lon      REAL NOT NULL,
  PRIMARY KEY (shape_id, sequence)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sim_public_holiday (
  holiday_date TEXT NOT NULL,
  name         TEXT NOT NULL,
  region       TEXT NOT NULL,
  holiday_kind TEXT NOT NULL CHECK (holiday_kind IN ('full-day', 'part-day')),
  start_time   TEXT,
  end_time     TEXT,
  source_url   TEXT NOT NULL,
  PRIMARY KEY (holiday_date, name, region)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sim_public_holiday_date ON sim_public_holiday(holiday_date);

-- ---------------------------------------------------------------- scope (docs/stations.xlsx)
CREATE TABLE IF NOT EXISTS scope_line (
  line_id       INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  colour        TEXT,
  start_station TEXT,
  end_station   TEXT
);

CREATE TABLE IF NOT EXISTS scope_station (
  station_id          INTEGER PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  line_id             INTEGER REFERENCES scope_line(line_id) ON DELETE SET NULL,
  line_seq            INTEGER,
  zone                TEXT,
  wheelchair          INTEGER CHECK (wheelchair IN (0, 1)),
  assisted_wheelchair INTEGER CHECK (assisted_wheelchair IN (0, 1)),
  lat                 REAL,
  lon                 REAL,
  osm_type            TEXT CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id              INTEGER,
  match_status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (match_status IN ('pending', 'matched', 'ambiguous', 'unmatched', 'manual')),
  match_note          TEXT
);

CREATE TABLE IF NOT EXISTS scope_connection (
  station_id  INTEGER PRIMARY KEY REFERENCES scope_station(station_id) ON DELETE CASCADE,
  connections TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scope_facility (
  name        TEXT PRIMARY KEY,
  description TEXT
);

-- ---------------------------------------------------------------- raw OSM (lossless)
CREATE TABLE IF NOT EXISTS osm_node (
  id            INTEGER PRIMARY KEY,
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  version       INTEGER NOT NULL DEFAULT 0,
  timestamp     TEXT,
  changeset     INTEGER,
  user          TEXT,
  tags          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tags)),
  in_scope      INTEGER NOT NULL DEFAULT 1,
  last_seen_run INTEGER
);
CREATE INDEX IF NOT EXISTS osm_node_latlon ON osm_node(lat, lon);

CREATE TABLE IF NOT EXISTS osm_way (
  id            INTEGER PRIMARY KEY,
  version       INTEGER NOT NULL DEFAULT 0,
  timestamp     TEXT,
  changeset     INTEGER,
  user          TEXT,
  tags          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tags)),
  in_scope      INTEGER NOT NULL DEFAULT 1,
  last_seen_run INTEGER
);

CREATE TABLE IF NOT EXISTS osm_way_node (
  way_id  INTEGER NOT NULL REFERENCES osm_way(id) ON DELETE CASCADE,
  seq     INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  PRIMARY KEY (way_id, seq)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS osm_way_node_node ON osm_way_node(node_id);

CREATE TABLE IF NOT EXISTS osm_relation (
  id            INTEGER PRIMARY KEY,
  version       INTEGER NOT NULL DEFAULT 0,
  timestamp     TEXT,
  changeset     INTEGER,
  user          TEXT,
  tags          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tags)),
  in_scope      INTEGER NOT NULL DEFAULT 1,
  last_seen_run INTEGER
);

CREATE TABLE IF NOT EXISTS osm_relation_member (
  relation_id INTEGER NOT NULL REFERENCES osm_relation(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  member_type TEXT NOT NULL CHECK (member_type IN ('node', 'way', 'relation')),
  member_id   INTEGER NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (relation_id, seq)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS osm_relation_member_ref ON osm_relation_member(member_type, member_id);

-- ---------------------------------------------------------------- typed railway layers
-- Tracks: OpenRailwayMap infrastructure, speed, train protection, electrification, gauge.
CREATE TABLE IF NOT EXISTS rail_track (
  way_id                INTEGER PRIMARY KEY,
  railway               TEXT NOT NULL,          -- rail, light_rail, subway, tram, narrow_gauge, funicular, monorail, miniature
  state                 TEXT NOT NULL DEFAULT 'present', -- present, disused, abandoned, razed, construction, proposed, preserved
  usage                 TEXT,                   -- main, branch, industrial, military, tourism, test, scientific
  service               TEXT,                   -- yard, siding, spur, crossover
  ref                   TEXT,
  name                  TEXT,
  operator              TEXT,
  owner                 TEXT,
  track_ref             TEXT,
  gauge                 TEXT,
  gauge_mm              INTEGER,
  electrified           TEXT,
  voltage               INTEGER,
  frequency             REAL,
  maxspeed              REAL,
  maxspeed_forward      REAL,
  maxspeed_backward     REAL,
  preferred_direction   TEXT,
  train_protection      TEXT,                   -- strongest system present (etcs, atp, atc, aws, ...)
  train_protection_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(train_protection_json)),
  tunnel                INTEGER NOT NULL DEFAULT 0,
  bridge                INTEGER NOT NULL DEFAULT 0,
  layer                 INTEGER,
  length_m              REAL,
  coords                TEXT NOT NULL CHECK (json_valid(coords)), -- [[lon,lat],...] in way-node order
  min_lat REAL, min_lon REAL, max_lat REAL, max_lon REAL
);
CREATE INDEX IF NOT EXISTS rail_track_ref ON rail_track(ref);
CREATE INDEX IF NOT EXISTS rail_track_usage ON rail_track(usage, service);

-- Stations and other operating points (ORM "facilities").
CREATE TABLE IF NOT EXISTS rail_station (
  osm_type         TEXT NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id           INTEGER NOT NULL,
  kind             TEXT NOT NULL,   -- station, halt, tram_stop, junction, yard, crossover, spur_junction, service_station, site, busway
  name             TEXT,
  railway_ref      TEXT,
  uic_ref          TEXT,
  operator         TEXT,
  network          TEXT,
  public_transport TEXT,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL,
  PRIMARY KEY (osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS rail_station_latlon ON rail_station(lat, lon);
CREATE INDEX IF NOT EXISTS rail_station_name ON rail_station(name);

CREATE TABLE IF NOT EXISTS rail_platform (
  osm_type         TEXT NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id           INTEGER NOT NULL,
  ref              TEXT,
  name             TEXT,
  height           REAL,
  length           REAL,
  station_osm_type TEXT,
  station_osm_id   INTEGER,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL,
  coords           TEXT CHECK (coords IS NULL OR json_valid(coords)),
  PRIMARY KEY (osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS rail_platform_latlon ON rail_platform(lat, lon);

CREATE TABLE IF NOT EXISTS rail_signal (
  node_id          INTEGER PRIMARY KEY,
  ref              TEXT,
  category         TEXT,           -- main, distant, combined, shunting, speed_limit, ... (first present)
  categories_json  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(categories_json)),
  direction        TEXT CHECK (direction IS NULL OR direction IN ('forward', 'backward', 'both')),
  position         TEXT,
  railway_position TEXT,
  deactivated      INTEGER NOT NULL DEFAULT 0,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS rail_signal_latlon ON rail_signal(lat, lon);

CREATE TABLE IF NOT EXISTS rail_switch (
  node_id            INTEGER PRIMARY KEY,
  ref                TEXT,
  switch_type        TEXT,
  turnout_side       TEXT,
  electric           TEXT,
  heated             TEXT,
  local_operated     TEXT,
  resetting          TEXT,
  maxspeed_straight  REAL,
  maxspeed_diverging REAL,
  lat                REAL NOT NULL,
  lon                REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS rail_switch_latlon ON rail_switch(lat, lon);

-- Every other railway point/area: milestones, level crossings, buffer stops,
-- derailers, signal boxes, stop positions, substations, railway landuse, POIs.
CREATE TABLE IF NOT EXISTS rail_feature (
  osm_type         TEXT NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id           INTEGER NOT NULL,
  kind             TEXT NOT NULL,
  ref              TEXT,
  name             TEXT,
  railway_position TEXT,
  lat              REAL NOT NULL,
  lon              REAL NOT NULL,
  coords           TEXT CHECK (coords IS NULL OR json_valid(coords)),
  PRIMARY KEY (osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS rail_feature_kind ON rail_feature(kind);
CREATE INDEX IF NOT EXISTS rail_feature_latlon ON rail_feature(lat, lon);

CREATE TABLE IF NOT EXISTS rail_route_master (
  relation_id  INTEGER PRIMARY KEY,
  route_master TEXT,
  ref          TEXT,
  name         TEXT,
  network      TEXT,
  operator     TEXT,
  colour       TEXT
);

CREATE TABLE IF NOT EXISTS rail_route (
  relation_id   INTEGER PRIMARY KEY,
  route         TEXT NOT NULL,          -- train, railway, light_rail, subway, tram, tracks
  ref           TEXT,
  name          TEXT,
  from_name     TEXT,
  to_name       TEXT,
  network       TEXT,
  operator      TEXT,
  colour        TEXT,
  master_id     INTEGER,
  member_count  INTEGER NOT NULL DEFAULT 0,
  way_count     INTEGER NOT NULL DEFAULT 0,
  stop_count    INTEGER NOT NULL DEFAULT 0,
  path_status   TEXT NOT NULL DEFAULT 'none' CHECK (path_status IN ('ok', 'gaps', 'none')),
  path_gaps     INTEGER NOT NULL DEFAULT 0,
  path_length_m REAL,
  path_coords   TEXT CHECK (path_coords IS NULL OR json_valid(path_coords))
);

CREATE TABLE IF NOT EXISTS rail_route_member (
  relation_id INTEGER NOT NULL REFERENCES rail_route(relation_id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  member_type TEXT NOT NULL CHECK (member_type IN ('node', 'way', 'relation')),
  member_id   INTEGER NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (relation_id, seq)
) WITHOUT ROWID;

-- Sheet lines matched to OSM route relations (rebuilt each ingest).
CREATE TABLE IF NOT EXISTS scope_line_route (
  line_id     INTEGER NOT NULL REFERENCES scope_line(line_id) ON DELETE CASCADE,
  relation_id INTEGER NOT NULL REFERENCES rail_route(relation_id) ON DELETE CASCADE,
  PRIMARY KEY (line_id, relation_id)
) WITHOUT ROWID;

-- ---------------------------------------------------------------- simulator topology
CREATE TABLE IF NOT EXISTS topo_node (
  node_id INTEGER PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('switch', 'crossing', 'junction', 'end', 'buffer_stop', 'split')),
  degree  INTEGER NOT NULL,
  lat     REAL NOT NULL,
  lon     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS topo_edge (
  edge_id   INTEGER PRIMARY KEY,
  way_id    INTEGER NOT NULL REFERENCES rail_track(way_id) ON DELETE CASCADE,
  seq_from  INTEGER NOT NULL,
  seq_to    INTEGER NOT NULL,
  from_node INTEGER NOT NULL REFERENCES topo_node(node_id),
  to_node   INTEGER NOT NULL REFERENCES topo_node(node_id),
  length_m  REAL NOT NULL,
  coords    TEXT NOT NULL CHECK (json_valid(coords)),
  UNIQUE (way_id, seq_from)
);
CREATE INDEX IF NOT EXISTS topo_edge_from ON topo_edge(from_node);
CREATE INDEX IF NOT EXISTS topo_edge_to ON topo_edge(to_node);

-- Legal moves through a switch: trunk edge -> branch edge (straight or diverging).
CREATE TABLE IF NOT EXISTS topo_switch_leg (
  switch_node INTEGER NOT NULL REFERENCES topo_node(node_id) ON DELETE CASCADE,
  trunk_edge  INTEGER NOT NULL REFERENCES topo_edge(edge_id) ON DELETE CASCADE,
  branch_edge INTEGER NOT NULL REFERENCES topo_edge(edge_id) ON DELETE CASCADE,
  leg         TEXT NOT NULL CHECK (leg IN ('straight', 'diverging')),
  angle_deg   REAL,
  PRIMARY KEY (switch_node, branch_edge)
) WITHOUT ROWID;

-- Linear referencing: features placed along edges with offset and facing.
CREATE TABLE IF NOT EXISTS topo_edge_feature (
  edge_id      INTEGER NOT NULL REFERENCES topo_edge(edge_id) ON DELETE CASCADE,
  feature_kind TEXT NOT NULL,     -- signal, switch, milestone, level_crossing, platform, station, ...
  osm_type     TEXT NOT NULL,
  osm_id       INTEGER NOT NULL,
  offset_m     REAL NOT NULL,     -- metres from edge start (from_node)
  snap_m       REAL NOT NULL,     -- 0 when the feature is a node on the track
  facing       TEXT CHECK (facing IS NULL OR facing IN ('forward', 'backward', 'both')),
  PRIMARY KEY (edge_id, feature_kind, osm_type, osm_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS topo_edge_feature_ref ON topo_edge_feature(osm_type, osm_id);

-- ---------------------------------------------------------------- spatial indexes
CREATE VIRTUAL TABLE IF NOT EXISTS rtree_track USING rtree(way_id, min_lat, max_lat, min_lon, max_lon);
CREATE VIRTUAL TABLE IF NOT EXISTS rtree_edge  USING rtree(edge_id, min_lat, max_lat, min_lon, max_lon);
