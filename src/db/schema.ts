export const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  photo_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tag_security_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  technology TEXT NOT NULL,
  verifier TEXT NOT NULL,
  key_ref TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  technology TEXT NOT NULL,
  identifier TEXT NOT NULL,
  epc TEXT,
  tid TEXT,
  uid TEXT,
  manufacturer TEXT,
  chip_family TEXT,
  chip_model TEXT,
  product_family TEXT,
  part_number TEXT,
  capabilities_json TEXT,
  metadata_json TEXT,
  security_profile_id INTEGER,
  item_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  last_auth_status TEXT NOT NULL DEFAULT 'not-requested',
  last_tamper_status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TEXT,
  registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (security_profile_id) REFERENCES tag_security_profiles(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  UNIQUE(technology, identifier)
);

CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  device_label TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL UNIQUE,
  station_id INTEGER,
  container_code TEXT,
  location_name TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  status TEXT DEFAULT 'open',
  notes TEXT,
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS inventory_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  tag_id INTEGER,
  technology TEXT NOT NULL,
  identifier TEXT NOT NULL,
  source TEXT NOT NULL,
  rssi REAL,
  antenna INTEGER,
  read_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  known_item_id INTEGER,
  auth_status TEXT NOT NULL DEFAULT 'not-requested',
  tamper_status TEXT NOT NULL DEFAULT 'unknown',
  FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (known_item_id) REFERENCES items(id),
  UNIQUE(session_id, technology, identifier)
);

CREATE TABLE IF NOT EXISTS tag_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_kind TEXT NOT NULL,
  session_id INTEGER,
  station_id INTEGER,
  tag_id INTEGER,
  technology TEXT NOT NULL,
  identifier TEXT NOT NULL,
  source TEXT NOT NULL,
  auth_status TEXT NOT NULL DEFAULT 'not-requested',
  tamper_status TEXT NOT NULL DEFAULT 'unknown',
  sensor_value REAL,
  sensor_unit TEXT,
  payload_json TEXT,
  raw TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_tags_item ON tags(item_id);
CREATE INDEX IF NOT EXISTS idx_tags_identifier ON tags(technology, identifier);
CREATE INDEX IF NOT EXISTS idx_tags_auth ON tags(last_auth_status);
CREATE INDEX IF NOT EXISTS idx_tags_tamper ON tags(last_tamper_status);
CREATE INDEX IF NOT EXISTS idx_inventory_observations_session ON inventory_observations(session_id);
CREATE INDEX IF NOT EXISTS idx_tag_events_tag ON tag_events(tag_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tag_events_session ON tag_events(session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tag_events_kind ON tag_events(event_kind, occurred_at DESC);
`;
