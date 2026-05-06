import type { AppDb } from "../../db/connection.js";
import { normalizeEpc } from "../../utils/normalize-epc.js";

export function createTagsService(db: AppDb) {
  return {
    list(status?: string) {
      if (status) {
        return db.prepare(`
          SELECT
            rfid_tags.*,
            items.name AS item_name,
            items.sku AS item_sku,
            items.category AS item_category
          FROM rfid_tags
          LEFT JOIN items ON items.id = rfid_tags.item_id
          WHERE rfid_tags.status = ?
          ORDER BY rfid_tags.registered_at DESC
        `).all(status);
      }

      return db.prepare(`
        SELECT
          rfid_tags.*,
          items.name AS item_name,
          items.sku AS item_sku,
          items.category AS item_category
        FROM rfid_tags
        LEFT JOIN items ON items.id = rfid_tags.item_id
        ORDER BY rfid_tags.registered_at DESC
      `).all();
    },

    resolve(rawEpc: string) {
      const epc = normalizeEpc(rawEpc);
      if (!epc) return null;

      return db.prepare(`
        SELECT
          rfid_tags.*,
          items.name AS item_name,
          items.sku AS item_sku,
          items.category AS item_category
        FROM rfid_tags
        LEFT JOIN items ON items.id = rfid_tags.item_id
        WHERE rfid_tags.epc = ?
      `).get(epc);
    },

    register(rawEpc: string, itemId: number, tid?: string) {
      const epc = normalizeEpc(rawEpc);
      if (!epc) return { ok: false, error: "INVALID_EPC" };

      const item = db.prepare("SELECT id FROM items WHERE id = ?").get(itemId);
      if (!item) return { ok: false, error: "ITEM_NOT_FOUND" };

      db.prepare(`
        INSERT INTO rfid_tags (epc, tid, item_id)
        VALUES (?, ?, ?)
        ON CONFLICT(epc) DO UPDATE SET
          tid = COALESCE(excluded.tid, rfid_tags.tid),
          item_id = excluded.item_id,
          status = 'active'
      `).run(epc, tid ?? null, itemId);

      return { ok: true, tag: this.resolve(epc) };
    },

    setStatus(rawEpc: string, status: "active" | "inactive" | "ignored" | "external") {
      const epc = normalizeEpc(rawEpc);
      if (!epc) return { ok: false, error: "INVALID_EPC" };

      const result = db.prepare("UPDATE rfid_tags SET status = ? WHERE epc = ?").run(status, epc);
      if (result.changes === 0) return { ok: false, error: "TAG_NOT_FOUND" };

      return { ok: true, tag: this.resolve(epc) };
    },

    markUnknown(rawEpc: string, status: "ignored" | "external") {
      const epc = normalizeEpc(rawEpc);
      if (!epc) return { ok: false, error: "INVALID_EPC" };

      const placeholder = db.prepare("SELECT id FROM items WHERE sku = ?").get(`SYSTEM-${status.toUpperCase()}`) as { id: number } | undefined;
      const itemId = placeholder?.id ?? Number(db.prepare(`
        INSERT INTO items (sku, name, category, notes)
        VALUES (?, ?, 'System', ?)
      `).run(
        `SYSTEM-${status.toUpperCase()}`,
        status === "ignored" ? "Ignored external tag" : "External tag",
        "System placeholder for non-inventory RFID reads"
      ).lastInsertRowid);

      db.prepare(`
        INSERT INTO rfid_tags (epc, item_id, status)
        VALUES (?, ?, ?)
        ON CONFLICT(epc) DO UPDATE SET status = excluded.status
      `).run(epc, itemId, status);

      return { ok: true, tag: this.resolve(epc) };
    }
  };
}
