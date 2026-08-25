import { nanoid } from "nanoid";
import type { AppDb } from "../../db/connection.js";
import { nowIso } from "../../utils/time.js";

export type CreateSessionInput = {
  stationKey?: string;
  containerCode?: string;
  locationName?: string;
  notes?: string;
};

type SessionRow = {
  id: number;
  session_key: string;
  station_id: number | null;
  station_key: string | null;
  station_name: string | null;
  container_code: string | null;
  location_name: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  notes: string | null;
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

  function get(sessionKey: string) {
    const session = db.prepare(`
      SELECT inventory_sessions.*, stations.station_key, stations.name AS station_name
      FROM inventory_sessions
      LEFT JOIN stations ON stations.id = inventory_sessions.station_id
      WHERE inventory_sessions.session_key = ?
    `).get(sessionKey) as SessionRow | undefined;
    if (!session) return null;

    const reads = db.prepare(`
      SELECT
        inventory_observations.*,
        items.name AS item_name,
        items.sku AS item_sku,
        items.category AS item_category,
        tags.chip_model,
        tags.product_family,
        tags.part_number
      FROM inventory_observations
      LEFT JOIN items ON items.id = inventory_observations.known_item_id
      LEFT JOIN tags ON tags.id = inventory_observations.tag_id
      WHERE inventory_observations.session_id = ?
      ORDER BY inventory_observations.last_seen_at DESC
    `).all(session.id);

    const events = db.prepare(`
      SELECT
        tag_events.*,
        items.name AS item_name,
        items.sku AS item_sku,
        tags.chip_model,
        tags.product_family
      FROM tag_events
      LEFT JOIN tags ON tags.id = tag_events.tag_id
      LEFT JOIN items ON items.id = tags.item_id
      WHERE tag_events.session_id = ?
      ORDER BY tag_events.occurred_at DESC, tag_events.id DESC
    `).all(session.id);

    return { ...session, reads, events };
  }

  return {
    create(input: CreateSessionInput) {
      const stationId = ensureStation(input.stationKey);
      const sessionKey = `inv_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${nanoid(6)}`;

      db.prepare(`
        INSERT INTO inventory_sessions (session_key, station_id, container_code, location_name, notes, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')
      `).run(sessionKey, stationId, input.containerCode ?? null, input.locationName ?? null, input.notes ?? null, nowIso());

      return get(sessionKey);
    },

    list() {
      return db.prepare(`
        SELECT
          inventory_sessions.*,
          stations.station_key,
          stations.name AS station_name,
          COUNT(inventory_observations.id) AS unique_reads,
          COALESCE(SUM(inventory_observations.read_count), 0) AS raw_reads,
          SUM(CASE WHEN inventory_observations.technology = 'nfc' THEN 1 ELSE 0 END) AS nfc_reads,
          SUM(CASE WHEN inventory_observations.technology = 'uhf-rain' THEN 1 ELSE 0 END) AS uhf_reads,
          SUM(CASE WHEN inventory_observations.auth_status IN ('failed', 'replay', 'error') THEN 1 ELSE 0 END) AS auth_alerts,
          SUM(CASE WHEN inventory_observations.tamper_status IN ('open', 'invalid') OR inventory_observations.permanent_tamper_status = 'opened-once' THEN 1 ELSE 0 END) AS tamper_alerts
        FROM inventory_sessions
        LEFT JOIN stations ON stations.id = inventory_sessions.station_id
        LEFT JOIN inventory_observations ON inventory_observations.session_id = inventory_sessions.id
        GROUP BY inventory_sessions.id
        ORDER BY inventory_sessions.started_at DESC
      `).all();
    },

    get,

    close(sessionKey: string) {
      db.prepare(`
        UPDATE inventory_sessions
        SET status = 'closed', ended_at = ?
        WHERE session_key = ? AND status = 'open'
      `).run(nowIso(), sessionKey);

      return get(sessionKey);
    }
  };
}
