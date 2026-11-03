import type { AppDb } from "../../db/connection.js";

export function createReportsService(db: AppDb) {
  return {
    dashboardSummary() {
      const counts = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM items WHERE status != 'archived') AS active_items,
          (SELECT COUNT(*) FROM tags WHERE status = 'active') AS active_tags,
          (SELECT COUNT(*) FROM tags WHERE status = 'active' AND technology = 'nfc') AS nfc_tags,
          (SELECT COUNT(*) FROM tags WHERE status = 'active' AND technology = 'uhf-rain') AS uhf_tags,
          (SELECT COUNT(*) FROM inventory_sessions WHERE status = 'open') AS open_sessions,
          (SELECT COUNT(*) FROM tags WHERE last_auth_status IN ('failed', 'replay', 'error')) AS auth_alerts,
          (SELECT COUNT(*) FROM tags WHERE last_tamper_status IN ('open', 'invalid') OR permanent_tamper_status = 'opened-once') AS tamper_alerts,
          (SELECT COUNT(*) FROM tags WHERE security_profile_id IS NOT NULL) AS secured_tags
      `).get();

      const recentEvents = db.prepare(`
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
        LIMIT 12
      `).all();

      return { counts, recentEvents };
    },

    unknownTags() {
      return db.prepare(`
        SELECT
          inventory_observations.technology,
          inventory_observations.identifier,
          COUNT(DISTINCT inventory_observations.session_id) AS session_count,
          SUM(inventory_observations.read_count) AS total_reads,
          MAX(inventory_observations.last_seen_at) AS last_seen_at
        FROM inventory_observations
        LEFT JOIN tags
          ON tags.technology = inventory_observations.technology
          AND tags.identifier = inventory_observations.identifier
          AND tags.status = 'active'
        WHERE tags.id IS NULL
        GROUP BY inventory_observations.technology, inventory_observations.identifier
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
          tags.technology,
          tags.identifier,
          tags.chip_model,
          tags.product_family,
          MAX(inventory_observations.last_seen_at) AS last_seen_at,
          COALESCE(SUM(inventory_observations.read_count), 0) AS total_reads
        FROM items
        LEFT JOIN tags ON tags.item_id = items.id AND tags.status = 'active'
        LEFT JOIN inventory_observations ON inventory_observations.tag_id = tags.id
        WHERE items.status != 'archived'
        GROUP BY items.id, tags.id
        ORDER BY last_seen_at DESC, items.name
      `).all();
    },

    securityAlerts(limit = 100) {
      const bounded = Math.max(1, Math.min(limit, 500));
      return db.prepare(`
        SELECT
          tags.id,
          tags.technology,
          tags.identifier,
          tags.chip_model,
          tags.product_family,
          tags.last_auth_status,
          tags.last_auth_counter,
          tags.last_tamper_status,
          tags.permanent_tamper_status,
          tags.last_seen_at,
          items.name AS item_name,
          items.sku AS item_sku
        FROM tags
        LEFT JOIN items ON items.id = tags.item_id
        WHERE tags.status = 'active'
          AND (
            tags.last_auth_status IN ('failed', 'replay', 'error')
            OR tags.last_tamper_status IN ('open', 'invalid')
            OR tags.permanent_tamper_status = 'opened-once'
          )
        ORDER BY COALESCE(tags.last_seen_at, tags.updated_at) DESC
        LIMIT ?
      `).all(bounded);
    }
  };
}
