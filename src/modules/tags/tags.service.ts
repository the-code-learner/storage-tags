import type { AppDb } from "../../db/connection.js";
import { normalizeEpc } from "../../utils/normalize-epc.js";

export function createTagsService(db: AppDb) {
  return {
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
    }
  };
}
