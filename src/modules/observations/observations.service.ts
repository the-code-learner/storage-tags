import type { AppDb } from "../../db/connection.js";
import { normalizeTagIdentifier } from "../../utils/normalize-tag.js";
import { nowIso } from "../../utils/time.js";
import type { AuthStatus, TagObservationInput, TamperStatus } from "../tags/tag.types.js";

export function createObservationsService(db: AppDb) {
  function findTag(technology: TagObservationInput["technology"], identifier: string) {
    return db.prepare(`
      SELECT
        tags.*,
        items.name AS item_name,
        items.sku AS item_sku,
        items.category AS item_category
      FROM tags
      LEFT JOIN items ON items.id = tags.item_id
      WHERE tags.technology = ? AND tags.identifier = ? AND tags.status = 'active'
    `).get(technology, identifier) as any;
  }

  function findSession(sessionKey?: string) {
    if (!sessionKey) return undefined;
    return db.prepare("SELECT id, session_key, status FROM inventory_sessions WHERE session_key = ?").get(sessionKey) as { id: number; session_key: string; status: string } | undefined;
  }

  function findStation(stationKey?: string) {
    if (!stationKey) return undefined;
    return db.prepare("SELECT id, station_key FROM stations WHERE station_key = ?").get(stationKey) as { id: number; station_key: string } | undefined;
  }

  return {
    process(input: TagObservationInput) {
      const identifier = normalizeTagIdentifier(input.technology, input.identifier);
      if (!identifier) return { ok: false as const, error: "INVALID_IDENTIFIER" as const };

      const seenAt = input.seenAt ?? nowIso();
      const session = findSession(input.sessionKey);
      if (input.sessionKey && !session) return { ok: false as const, error: "SESSION_NOT_FOUND" as const };
      if (session && session.status !== "open") return { ok: false as const, error: "SESSION_CLOSED" as const };

      const station = findStation(input.stationKey);
      if (input.stationKey && !station) return { ok: false as const, error: "STATION_NOT_FOUND" as const };

      const tag = findTag(input.technology, identifier);
      const authStatus: AuthStatus = input.authStatus ?? "not-requested";
      const tamperStatus: TamperStatus = input.tamperStatus ?? "unknown";

      if (tag) {
        db.prepare(`
          UPDATE tags
          SET
            epc = COALESCE(?, epc),
            tid = COALESCE(?, tid),
            uid = COALESCE(?, uid),
            last_seen_at = ?,
            last_auth_status = CASE WHEN ? = 'not-requested' THEN last_auth_status ELSE ? END,
            last_tamper_status = CASE WHEN ? = 'unknown' THEN last_tamper_status ELSE ? END,
            updated_at = ?
          WHERE id = ?
        `).run(
          input.epc ?? null,
          input.tid ?? null,
          input.uid ?? null,
          seenAt,
          authStatus,
          authStatus,
          tamperStatus,
          tamperStatus,
          seenAt,
          tag.id
        );
      }

      if (session) {
        db.prepare(`
          INSERT INTO inventory_observations (
            session_id, tag_id, technology, identifier, source, rssi, antenna,
            read_count, first_seen_at, last_seen_at, known_item_id, auth_status, tamper_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, technology, identifier) DO UPDATE SET
            tag_id = COALESCE(excluded.tag_id, inventory_observations.tag_id),
            read_count = inventory_observations.read_count + 1,
            last_seen_at = excluded.last_seen_at,
            known_item_id = COALESCE(excluded.known_item_id, inventory_observations.known_item_id),
            auth_status = CASE WHEN excluded.auth_status = 'not-requested' THEN inventory_observations.auth_status ELSE excluded.auth_status END,
            tamper_status = CASE WHEN excluded.tamper_status = 'unknown' THEN inventory_observations.tamper_status ELSE excluded.tamper_status END,
            rssi = COALESCE(excluded.rssi, inventory_observations.rssi),
            antenna = COALESCE(excluded.antenna, inventory_observations.antenna)
        `).run(
          session.id,
          tag?.id ?? null,
          input.technology,
          identifier,
          input.source,
          input.rssi ?? null,
          input.antenna ?? null,
          seenAt,
          seenAt,
          tag?.item_id ?? null,
          authStatus,
          tamperStatus
        );
      }

      const shouldRecordEvent =
        input.technology === "nfc" ||
        authStatus !== "not-requested" ||
        tamperStatus !== "unknown" ||
        input.sensorValue !== undefined;

      if (shouldRecordEvent) {
        const eventKind = authStatus !== "not-requested"
          ? "verification"
          : tamperStatus !== "unknown" || input.sensorValue !== undefined
            ? "status"
            : "scan";

        db.prepare(`
          INSERT INTO tag_events (
            event_kind, session_id, station_id, tag_id, technology, identifier,
            source, auth_status, tamper_status, sensor_value, sensor_unit,
            payload_json, raw, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          eventKind,
          session?.id ?? null,
          station?.id ?? null,
          tag?.id ?? null,
          input.technology,
          identifier,
          input.source,
          authStatus,
          tamperStatus,
          input.sensorValue ?? null,
          input.sensorUnit ?? null,
          input.payload || input.ndefUrl ? JSON.stringify({ ...(input.payload ?? {}), ...(input.ndefUrl ? { ndefUrl: input.ndefUrl } : {}) }) : null,
          input.raw ?? null,
          seenAt
        );
      }

      return {
        ok: true as const,
        technology: input.technology,
        identifier,
        known: Boolean(tag),
        authStatus,
        tamperStatus,
        item: tag ? {
          id: tag.item_id,
          name: tag.item_name,
          sku: tag.item_sku,
          category: tag.item_category
        } : null
      };
    },

    recentEvents(limit = 100) {
      const bounded = Math.max(1, Math.min(limit, 500));
      return db.prepare(`
        SELECT
          tag_events.*,
          items.name AS item_name,
          items.sku AS item_sku,
          tags.chip_model,
          tags.product_family
        FROM tag_events
        LEFT JOIN tags ON tags.id = tag_events.tag_id
        LEFT JOIN items ON items.id = tags.item_id
        ORDER BY tag_events.occurred_at DESC, tag_events.id DESC
        LIMIT ?
      `).all(bounded);
    }
  };
}
