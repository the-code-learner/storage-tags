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

      const demoItems = [
        ["OIL-EVO-500", "Extra Virgin Olive Oil 500 ml", "Food / Oil", "Demo item with UHF and NFC identity"],
        ["PASTA-001", "Pasta 1 kg", "Food / Dry Goods", "Demo item"],
        ["DOC-BOX-A", "Archive Box A", "Documents", "Demo item"]
      ];

      for (const item of demoItems) {
        db.prepare("INSERT INTO items (sku, name, category, notes) VALUES (?, ?, ?, ?)").run(...item);
      }

      const rows = db.prepare("SELECT id, sku FROM items").all() as { id: number; sku: string }[];
      const bySku = new Map(rows.map((row) => [row.sku, row.id]));
      const tags = [
        {
          technology: "uhf-rain",
          identifier: "3034257BF7194E4000001A85",
          epc: "3034257BF7194E4000001A85",
          itemId: bySku.get("OIL-EVO-500"),
          chipFamily: "generic-uhf",
          capabilities: { bulkInventory: true }
        },
        {
          technology: "nfc",
          identifier: "04DE5F1EACC040",
          uid: "04DE5F1EACC040",
          itemId: bySku.get("OIL-EVO-500"),
          manufacturer: "NXP",
          chipFamily: "NTAG 424 DNA",
          chipModel: "NTAG 424 DNA TagTamper",
          capabilities: { ndef: true, sun: true, sdm: true, tamper: true, currentTamperStatus: true, permanentTamperStatus: true }
        },
        {
          technology: "uhf-rain",
          identifier: "3034257BF7194E4000001A86",
          epc: "3034257BF7194E4000001A86",
          itemId: bySku.get("PASTA-001"),
          chipFamily: "generic-uhf",
          capabilities: { bulkInventory: true }
        },
        {
          technology: "uhf-rain",
          identifier: "E2806894000040178F2A91B5",
          epc: "E2806894000040178F2A91B5",
          itemId: bySku.get("DOC-BOX-A"),
          chipFamily: "generic-uhf",
          capabilities: { bulkInventory: true }
        }
      ];

      for (const tag of tags) {
        if (!tag.itemId) continue;
        db.prepare(`
          INSERT INTO tags (
            technology, identifier, epc, uid, manufacturer, chip_family, chip_model,
            capabilities_json, item_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(
          tag.technology,
          tag.identifier,
          tag.epc ?? null,
          tag.uid ?? null,
          tag.manufacturer ?? null,
          tag.chipFamily,
          tag.chipModel ?? null,
          JSON.stringify(tag.capabilities),
          tag.itemId
        );
      }

      return { inserted: true };
    }
  };
}
