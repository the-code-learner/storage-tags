import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { schemaSql } from "./schema.js";

export function createDb(databaseUrl = config.databaseUrl) {
  if (databaseUrl !== ":memory:") fs.mkdirSync(path.dirname(databaseUrl), { recursive: true });
  const db = new DatabaseSync(databaseUrl);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  migrateLegacyRfidData(db);
  return db;
}

export type AppDb = ReturnType<typeof createDb>;

function tableExists(db: DatabaseSync, table: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function migrateLegacyRfidData(db: DatabaseSync) {
  if (!tableExists(db, "rfid_tags")) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      INSERT INTO tags (
        technology,
        identifier,
        epc,
        tid,
        chip_family,
        capabilities_json,
        item_id,
        status,
        registered_at,
        updated_at
      )
      SELECT
        'uhf-rain',
        UPPER(REPLACE(REPLACE(TRIM(epc), ':', ''), '-', '')),
        UPPER(REPLACE(REPLACE(TRIM(epc), ':', ''), '-', '')),
        tid,
        'legacy-uhf',
        '{"bulkInventory":true}',
        item_id,
        status,
        registered_at,
        registered_at
      FROM rfid_tags
      WHERE TRIM(epc) != ''
      ON CONFLICT(technology, identifier) DO NOTHING;
    `);

    if (tableExists(db, "inventory_reads")) {
      db.exec(`
        INSERT INTO inventory_observations (
          session_id,
          tag_id,
          technology,
          identifier,
          source,
          rssi,
          antenna,
          read_count,
          first_seen_at,
          last_seen_at,
          known_item_id,
          auth_status,
          tamper_status
        )
        SELECT
          legacy.session_id,
          tags.id,
          'uhf-rain',
          UPPER(REPLACE(REPLACE(TRIM(legacy.epc), ':', ''), '-', '')),
          legacy.source,
          legacy.rssi,
          legacy.antenna,
          legacy.read_count,
          COALESCE(legacy.first_seen_at, legacy.last_seen_at, CURRENT_TIMESTAMP),
          COALESCE(legacy.last_seen_at, legacy.first_seen_at, CURRENT_TIMESTAMP),
          legacy.known_item_id,
          'not-requested',
          'unknown'
        FROM inventory_reads legacy
        LEFT JOIN tags
          ON tags.technology = 'uhf-rain'
          AND tags.identifier = UPPER(REPLACE(REPLACE(TRIM(legacy.epc), ':', ''), '-', ''))
        WHERE TRIM(legacy.epc) != ''
        ON CONFLICT(session_id, technology, identifier) DO NOTHING;
      `);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
