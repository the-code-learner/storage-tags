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

export function createItemsService(db: AppDb) {
  return {
    list(search?: string) {
      if (search) {
        const term = `%${search}%`;
        return db.prepare(`
          SELECT * FROM items
          WHERE name LIKE ? OR sku LIKE ? OR category LIKE ?
          ORDER BY updated_at DESC, id DESC
        `).all(term, term, term);
      }

      return db.prepare("SELECT * FROM items ORDER BY updated_at DESC, id DESC").all();
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
    }
  };
}
