import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

export function createDb() {
  fs.mkdirSync(path.dirname(config.databaseUrl), { recursive: true });
  const db = new DatabaseSync(config.databaseUrl);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  return db;
}

export type AppDb = ReturnType<typeof createDb>;
