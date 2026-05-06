import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { schemaSql } from "./schema.js";

export function createDb() {
  fs.mkdirSync(path.dirname(config.databaseUrl), { recursive: true });
  const db = new DatabaseSync(config.databaseUrl);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  ensureColumn(db, "items", "status", "TEXT DEFAULT 'active'");
  return db;
}

export type AppDb = ReturnType<typeof createDb>;

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
