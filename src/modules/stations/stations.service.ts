import type { AppDb } from "../../db/connection.js";

export type StationInput = {
  stationKey: string;
  name: string;
  type?: string;
  inputMode?: string;
  deviceLabel?: string;
  config?: Record<string, unknown>;
};

export function createStationsService(db: AppDb) {
  return {
    list() {
      return db.prepare("SELECT * FROM stations ORDER BY created_at DESC").all();
    },

    get(stationKey: string) {
      return db.prepare("SELECT * FROM stations WHERE station_key = ?").get(stationKey);
    },

    upsert(input: StationInput) {
      db.prepare(`
        INSERT INTO stations (station_key, name, type, input_mode, device_label, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(station_key) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          input_mode = excluded.input_mode,
          device_label = excluded.device_label,
          config_json = excluded.config_json
      `).run(
        input.stationKey,
        input.name,
        input.type ?? "browser",
        input.inputMode ?? "browser-hid",
        input.deviceLabel ?? null,
        input.config ? JSON.stringify(input.config) : null
      );

      return this.get(input.stationKey);
    }
  };
}
