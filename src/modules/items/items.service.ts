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
          SELECT * FROM items
          WHERE (name LIKE ? OR sku LIKE ? OR category LIKE ?)
            AND status != 'archived'
          ORDER BY updated_at DESC, id DESC
        `).all(term, term, term);
      }

      return db.prepare("SELECT * FROM items WHERE status != 'archived' ORDER BY updated_at DESC, id DESC").all();
    },

    get(id: number) {
      return db.prepare("SELECT * FROM items WHERE id = ?").get(id);
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
      const existing = this.get(id) as {
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
        SET
          sku = ?,
          name = ?,
          description = ?,
          category = ?,
          photo_url = ?,
          notes = ?,
          updated_at = ?
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
      const existing = this.get(id);
      if (!existing) return false;

      db.prepare("UPDATE rfid_tags SET status = 'inactive' WHERE item_id = ?").run(id);
      db.prepare("UPDATE items SET status = 'archived', updated_at = ? WHERE id = ?").run(nowIso(), id);
      return true;
    }
  };
}
