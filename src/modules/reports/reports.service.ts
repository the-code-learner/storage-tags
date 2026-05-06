import type { AppDb } from "../../db/connection.js";

export function createReportsService(db: AppDb) {
  return {
    unknownTags() {
      return db.prepare(`
        SELECT
          inventory_reads.epc,
          COUNT(DISTINCT inventory_reads.session_id) AS session_count,
          SUM(inventory_reads.read_count) AS total_reads,
          MAX(inventory_reads.last_seen_at) AS last_seen_at
        FROM inventory_reads
        LEFT JOIN rfid_tags ON rfid_tags.epc = inventory_reads.epc AND rfid_tags.status = 'active'
        WHERE rfid_tags.id IS NULL
        GROUP BY inventory_reads.epc
        ORDER BY last_seen_at DESC
      `).all();
    },

    itemsLastSeen() {
      return db.prepare(`
        SELECT
          items.id,
          items.name,
          items.sku,
          items.category,
          rfid_tags.epc,
          MAX(inventory_reads.last_seen_at) AS last_seen_at,
          SUM(inventory_reads.read_count) AS total_reads
        FROM items
        LEFT JOIN rfid_tags ON rfid_tags.item_id = items.id AND rfid_tags.status = 'active'
        LEFT JOIN inventory_reads ON inventory_reads.epc = rfid_tags.epc
        GROUP BY items.id, rfid_tags.epc
        ORDER BY last_seen_at DESC
      `).all();
    }
  };
}
