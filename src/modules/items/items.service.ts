import type { AppDb } from "../../db/connection.js";
import { nowIso } from "../../utils/time.js";

export type CreateItemInput = {
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  photoUrl?: string;
  notes?: string;
};

export type UpdateItemInput = Partial<CreateItemInput>;

export function createItemsService(db: AppDb) {
  return {
    list(search?: string) {
      if (search) {
        const term = `%${search}%`;
        return db.prepare(`
          SELECT
            items.*,
            COUNT(tags.id) AS tag_count,
            SUM(CASE WHEN tags.technology = 'nfc' AND tags.status = 'active' THEN 1 ELSE 0 END) AS nfc_tag_count,
            SUM(CASE WHEN tags.technology = 'uhf-rain' AND tags.status = 'active' THEN 1 ELSE 0 END) AS uhf_tag_count
          FROM items
          LEFT JOIN tags ON tags.item_id = items.id
          WHERE (items.name LIKE ? OR items.sku LIKE ? OR items.category LIKE ?)
            AND items.status != 'archived'
          GROUP BY items.id
          ORDER BY items.updated_at DESC, items.id DESC
        `).all(term, term, term);
      }

      return db.prepare(`
        SELECT
          items.*,
          COUNT(tags.id) AS tag_count,
          SUM(CASE WHEN tags.technology = 'nfc' AND tags.status = 'active' THEN 1 ELSE 0 END) AS nfc_tag_count,
          SUM(CASE WHEN tags.technology = 'uhf-rain' AND tags.status = 'active' THEN 1 ELSE 0 END) AS uhf_tag_count
        FROM items
        LEFT JOIN tags ON tags.item_id = items.id
        WHERE items.status != 'archived'
        GROUP BY items.id
        ORDER BY items.updated_at DESC, items.id DESC
      `).all();
    },

    get(id: number) {
      const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;
      if (!item) return null;
      const tags = db.prepare(`
        SELECT * FROM tags
        WHERE item_id = ?
        ORDER BY status = 'active' DESC, technology, registered_at DESC
      `).all(id);
      return { ...item, tags };
    },

    create(input: CreateItemInput) {
      const timestamp = nowIso();
      const result = db.prepare(`
        INSERT INTO items (sku, name, description, category, photo_url, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.sku ?? null,
        input.name,
        input.description ?? null,
        input.category ?? null,
        input.photoUrl ?? null,
        input.notes ?? null,
        timestamp,
        timestamp
      );

      return this.get(Number(result.lastInsertRowid));
    },

    update(id: number, input: UpdateItemInput) {
      const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as {
        sku: string | null;
        name: string;
        description: string | null;
        category: string | null;
        photo_url: string | null;
        notes: string | null;
      } | undefined;
      if (!existing) return null;

      db.prepare(`
        UPDATE items
        SET sku = ?, name = ?, description = ?, category = ?, photo_url = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.sku ?? existing.sku ?? null,
        input.name ?? existing.name,
        input.description ?? existing.description ?? null,
        input.category ?? existing.category ?? null,
        input.photoUrl ?? existing.photo_url ?? null,
        input.notes ?? existing.notes ?? null,
        nowIso(),
        id
      );

      return this.get(id);
    },

    remove(id: number) {
      const existing = db.prepare("SELECT id FROM items WHERE id = ?").get(id);
      if (!existing) return false;

      db.prepare("UPDATE tags SET status = 'inactive', updated_at = ? WHERE item_id = ?").run(nowIso(), id);
      db.prepare("UPDATE items SET status = 'archived', updated_at = ? WHERE id = ?").run(nowIso(), id);
      return true;
    }
  };
}
