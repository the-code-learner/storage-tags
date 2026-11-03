import type { AppDb } from "../../db/connection.js";
import { normalizeTagIdentifier } from "../../utils/normalize-tag.js";
import { nowIso } from "../../utils/time.js";
import { getCatalogEntry, tagCatalog } from "./tag.catalog.js";
import type { RegisterTagInput, TagStatus, TagTechnology } from "./tag.types.js";

function selectTagSql() {
  return `
    SELECT
      tags.*,
      items.name AS item_name,
      items.sku AS item_sku,
      items.category AS item_category,
      tag_security_profiles.profile_key AS security_profile_key,
      tag_security_profiles.name AS security_profile_name,
      tag_security_profiles.verifier AS security_verifier
    FROM tags
    LEFT JOIN items ON items.id = tags.item_id
    LEFT JOIN tag_security_profiles ON tag_security_profiles.id = tags.security_profile_id
  `;
}

export function createTagsService(db: AppDb) {
  function resolve(technology: TagTechnology, rawIdentifier: string) {
    const identifier = normalizeTagIdentifier(technology, rawIdentifier);
    if (!identifier) return null;
    return db.prepare(`${selectTagSql()} WHERE tags.technology = ? AND tags.identifier = ?`).get(technology, identifier);
  }

  function register(input: RegisterTagInput) {
    const catalog = getCatalogEntry(input.catalogKey);
    const technology = catalog?.technology ?? input.technology;
    const identifier = normalizeTagIdentifier(technology, input.identifier);
    if (!identifier) return { ok: false, error: "INVALID_IDENTIFIER" as const };

    if (input.itemId !== undefined) {
      const item = db.prepare("SELECT id FROM items WHERE id = ? AND status != 'archived'").get(input.itemId);
      if (!item) return { ok: false, error: "ITEM_NOT_FOUND" as const };
    }

    let securityProfileId: number | null = null;
    if (input.securityProfileKey) {
      const profile = db.prepare("SELECT id FROM tag_security_profiles WHERE profile_key = ? AND status = 'active'").get(input.securityProfileKey) as { id: number } | undefined;
      if (!profile) return { ok: false, error: "SECURITY_PROFILE_NOT_FOUND" as const };
      securityProfileId = profile.id;
    }

    const capabilities = { ...(catalog?.capabilities ?? {}), ...(input.capabilities ?? {}) };
    const timestamp = nowIso();
    const epc = technology === "uhf-rain" ? normalizeTagIdentifier("uhf-rain", input.epc ?? identifier) : input.epc ?? null;
    const uid = technology === "nfc" ? normalizeTagIdentifier("nfc", input.uid ?? identifier) : input.uid ?? null;

    db.prepare(`
      INSERT INTO tags (
        technology, identifier, epc, tid, uid,
        manufacturer, chip_family, chip_model, product_family, part_number,
        capabilities_json, metadata_json, security_profile_id, item_id,
        status, registered_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(technology, identifier) DO UPDATE SET
        epc = COALESCE(excluded.epc, tags.epc),
        tid = COALESCE(excluded.tid, tags.tid),
        uid = COALESCE(excluded.uid, tags.uid),
        manufacturer = COALESCE(excluded.manufacturer, tags.manufacturer),
        chip_family = COALESCE(excluded.chip_family, tags.chip_family),
        chip_model = COALESCE(excluded.chip_model, tags.chip_model),
        product_family = COALESCE(excluded.product_family, tags.product_family),
        part_number = COALESCE(excluded.part_number, tags.part_number),
        capabilities_json = COALESCE(excluded.capabilities_json, tags.capabilities_json),
        metadata_json = COALESCE(excluded.metadata_json, tags.metadata_json),
        security_profile_id = COALESCE(excluded.security_profile_id, tags.security_profile_id),
        item_id = COALESCE(excluded.item_id, tags.item_id),
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      technology,
      identifier,
      epc,
      input.tid ?? null,
      uid,
      input.manufacturer ?? catalog?.manufacturer ?? null,
      input.chipFamily ?? catalog?.chipFamily ?? null,
      input.chipModel ?? catalog?.chipModel ?? null,
      input.productFamily ?? catalog?.productFamily ?? null,
      input.partNumber ?? catalog?.partNumber ?? null,
      Object.keys(capabilities).length ? JSON.stringify(capabilities) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      securityProfileId,
      input.itemId ?? null,
      input.status ?? "active",
      timestamp,
      timestamp
    );

    return { ok: true, tag: resolve(technology, identifier) };
  }

  return {
    catalog() { return tagCatalog; },

    list(filters: { status?: string; technology?: TagTechnology; search?: string } = {}) {
      const clauses: string[] = [];
      const values: string[] = [];
      if (filters.status) { clauses.push("tags.status = ?"); values.push(filters.status); }
      if (filters.technology) { clauses.push("tags.technology = ?"); values.push(filters.technology); }
      if (filters.search) {
        const term = `%${filters.search}%`;
        clauses.push("(tags.identifier LIKE ? OR tags.epc LIKE ? OR tags.uid LIKE ? OR tags.chip_model LIKE ? OR tags.product_family LIKE ? OR items.name LIKE ? OR items.sku LIKE ?)");
        values.push(term, term, term, term, term, term, term);
      }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      return db.prepare(`${selectTagSql()}${where} ORDER BY COALESCE(tags.last_seen_at, tags.registered_at) DESC, tags.id DESC`).all(...values);
    },

    getById(id: number) { return db.prepare(`${selectTagSql()} WHERE tags.id = ?`).get(id); },
    resolve,
    register,

    setStatus(technology: TagTechnology, rawIdentifier: string, status: TagStatus) {
      const identifier = normalizeTagIdentifier(technology, rawIdentifier);
      if (!identifier) return { ok: false, error: "INVALID_IDENTIFIER" as const };
      const result = db.prepare("UPDATE tags SET status = ?, updated_at = ? WHERE technology = ? AND identifier = ?").run(status, nowIso(), technology, identifier);
      if (result.changes === 0) return { ok: false, error: "TAG_NOT_FOUND" as const };
      return { ok: true, tag: resolve(technology, identifier) };
    },

    markUnknown(technology: TagTechnology, rawIdentifier: string, status: "ignored" | "external") {
      return register({ technology, identifier: rawIdentifier, status });
    }
  };
}
