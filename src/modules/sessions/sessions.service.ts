import { nanoid } from "nanoid";
import type { AppDb } from "../../db/connection.js";
import { nowIso } from "../../utils/time.js";

export type CreateSessionInput = {
  stationKey?: string;
  containerCode?: string;
  locationName?: string;
  notes?: string;
};

export function createSessionsService(db: AppDb) {
  function ensureStation(stationKey?: string): number | null {
    if (!stationKey) return null;

    const existing = db.prepare("SELECT id FROM stations WHERE station_key = ?").get(stationKey) as { id: number } | undefined;
    if (existing) return existing.id;

    const result = db.prepare(`
      INSERT INTO stations (station_key, name, type, input_mode)
      VALUES (?, ?, 'browser', 'browser-hid')
    `).run(stationKey, stationKey);

    return Number(result.lastInsertRowid);
  }

  return {
    create(input: CreateSessionInput) {
      const stationId = ensureStation(input.stationKey);
      const sessionKey = `inv_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${nanoid(6)}`;

      db.prepare(`
        INSERT INTO inventory_sessions (session_key, station_id, container_code, location_name, notes, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')
      `).run(sessionKey, stationId, input.containerCode ?? null, input.locationName ?? null, input.notes ?? null, nowIso());

      return this.get(sessionKey);
    },

    list() {
      return db.prepare(`
        SELECT
          inventory_sessions.*,
          COUNT(inventory_reads.id) AS unique_reads,
          COALESCE(SUM(inventory_reads.read_count), 0) AS raw_reads
        FROM inventory_sessions
        LEFT JOIN inventory_reads ON inventory_reads.session_id = inventory_sessions.id
        GROUP BY inventory_sessions.id
        ORDER BY inventory_sessions.started_at DESC
      `).all();
    },

    get(sessionKey: string) {
      const session = db.prepare("SELECT * FROM inventory_sessions WHERE session_key = ?").get(sessionKey) as { id: number } | undefined;
      if (!session) return null;

      const reads = db.prepare(`
        SELECT
          inventory_reads.*,
          items.name AS item_name,
          items.sku AS item_sku,
          items.category AS item_category
        FROM inventory_reads
        LEFT JOIN items ON items.id = inventory_reads.known_item_id
        WHERE inventory_reads.session_id = ?
        ORDER BY inventory_reads.last_seen_at DESC
      `).all(session.id);

      return { ...session, reads };
    },

    close(sessionKey: string) {
      db.prepare(`
        UPDATE inventory_sessions
        SET status = 'closed', ended_at = ?
        WHERE session_key = ? AND status = 'open'
      `).run(nowIso(), sessionKey);

      return this.get(sessionKey);
    }
  };
}
