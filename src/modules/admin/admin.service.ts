import fs from "node:fs";
import path from "node:path";
import type { AppDb } from "../../db/connection.js";
import { config } from "../../config.js";

export function createAdminService(db: AppDb) {
  return {
    backup() {
      const backupDir = path.join(path.dirname(config.databaseUrl), "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      db.exec("PRAGMA wal_checkpoint(FULL)");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = path.join(backupDir, `inventory-${stamp}.sqlite`);
      fs.copyFileSync(config.databaseUrl, target);
      return { path: target };
    },

    seedDemoData() {
      const count = db.prepare("SELECT COUNT(*) AS count FROM items").get() as { count: number };
      if (count.count > 0) return { inserted: false };

      const items = [
        ["OIL-EVO-500", "Extra Virgin Olive Oil 500 ml", "Food / Oil", "Demo item"],
        ["PASTA-001", "Pasta 1 kg", "Food / Dry Goods", "Demo item"],
        ["DOC-BOX-A", "Archive Box A", "Documents", "Demo item"]
      ];

      for (const item of items) {
        db.prepare("INSERT INTO items (sku, name, category, notes) VALUES (?, ?, ?, ?)").run(...item);
      }

      const rows = db.prepare("SELECT id, sku FROM items").all() as { id: number; sku: string }[];
      const bySku = new Map(rows.map((row) => [row.sku, row.id]));
      const tags = [
        ["3034257BF7194E4000001A85", bySku.get("OIL-EVO-500")],
        ["3034257BF7194E4000001A86", bySku.get("PASTA-001")],
        ["E2806894000040178F2A91B5", bySku.get("DOC-BOX-A")]
      ] as [string, number | undefined][];

      for (const [epc, itemId] of tags) {
        if (!itemId) continue;
        db.prepare("INSERT INTO rfid_tags (epc, item_id) VALUES (?, ?)").run(epc, itemId);
      }

      return { inserted: true };
    }
  };
}
