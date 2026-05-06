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

CREATE TABLE IF NOT EXISTS rfid_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  epc TEXT NOT NULL UNIQUE,
  tid TEXT,
  item_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id)
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

CREATE TABLE IF NOT EXISTS inventory_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  epc TEXT NOT NULL,
  tid TEXT,
  source TEXT NOT NULL,
  rssi REAL,
  antenna INTEGER,
  read_count INTEGER DEFAULT 1,
  first_seen_at TEXT,
  last_seen_at TEXT,
  known_item_id INTEGER,
  FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
  FOREIGN KEY (known_item_id) REFERENCES items(id),
  UNIQUE(session_id, epc)
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_reads_session ON inventory_reads(session_id);
`;
