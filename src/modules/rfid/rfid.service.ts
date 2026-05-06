import type { AppDb } from "../../db/connection.js";
import { normalizeEpc } from "../../utils/normalize-epc.js";
import type { RfidReadEvent } from "./rfid.types.js";

export function createRfidService(db: AppDb) {
  return {
    processRead(event: RfidReadEvent) {
      const epc = normalizeEpc(event.epc);
      if (!epc) return { ok: false, error: "INVALID_EPC" };

      const tag = db.prepare(`
        SELECT
          rfid_tags.item_id,
          items.name,
          items.sku,
          items.category
        FROM rfid_tags
        LEFT JOIN items ON items.id = rfid_tags.item_id
        WHERE rfid_tags.epc = ? AND rfid_tags.status = 'active'
      `).get(epc) as { item_id: number; name: string; sku: string | null; category: string | null } | undefined;

      if (event.sessionId) {
        const session = db.prepare("SELECT id FROM inventory_sessions WHERE session_key = ?").get(event.sessionId) as { id: number } | undefined;
        if (!session) return { ok: false, error: "SESSION_NOT_FOUND" };

        db.prepare(`
          INSERT INTO inventory_reads (
            session_id, epc, tid, source, rssi, antenna, read_count,
            first_seen_at, last_seen_at, known_item_id
          )
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT(session_id, epc) DO UPDATE SET
            read_count = read_count + 1,
            last_seen_at = excluded.last_seen_at,
            known_item_id = COALESCE(excluded.known_item_id, inventory_reads.known_item_id)
        `).run(
          session.id,
          epc,
          event.tid ?? null,
          event.source,
          event.rssi ?? null,
          event.antenna ?? null,
          event.seenAt,
          event.seenAt,
          tag?.item_id ?? null
        );
      }

      return {
        ok: true,
        epc,
        known: Boolean(tag),
        item: tag ? { id: tag.item_id, name: tag.name, sku: tag.sku, category: tag.category } : null
      };
    }
  };
}
