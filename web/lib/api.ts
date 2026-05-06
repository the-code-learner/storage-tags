export type Item = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  notes: string | null;
  status?: string;
};

export type Station = {
  id: number;
  station_key: string;
  name: string;
  type: string;
  input_mode: string;
  device_label: string | null;
  config_json: string | null;
};

export type SessionRead = {
  epc: string;
  read_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  item_name: string | null;
  item_sku: string | null;
  item_category: string | null;
};

export type InventorySession = {
  id: number;
  session_key: string;
  container_code: string | null;
  location_name: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  reads: SessionRead[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "REQUEST_FAILED" }));
    throw new Error(error.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; time: string }>("/api/health"),
  listItems: (search = "") => request<Item[]>(`/api/items${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createItem: (body: Partial<Item> & { photoUrl?: string }) => request<{ ok: boolean; item: Item }>("/api/items", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: Partial<Item> & { photoUrl?: string }) => request<{ ok: boolean; item: Item }>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteItem: (id: number) => request<{ ok: boolean }>(`/api/items/${id}`, { method: "DELETE" }),
  resolveTag: (epc: string) => request<{ ok: boolean; known: boolean; tag: any }>(`/api/tags/${encodeURIComponent(epc)}`),
  registerTag: (epc: string, itemId: number) => request<{ ok: boolean; tag: any }>("/api/tags/register", { method: "POST", body: JSON.stringify({ epc, itemId }) }),
  markUnknownTag: (epc: string, status: "ignored" | "external") => request<{ ok: boolean; tag: any }>("/api/tags/mark-unknown", { method: "POST", body: JSON.stringify({ epc, status }) }),
  createSession: (body: { stationKey?: string; containerCode?: string; locationName?: string; notes?: string }) =>
    request<{ ok: boolean; session: InventorySession }>("/api/inventory-sessions", { method: "POST", body: JSON.stringify(body) }),
  getSession: (sessionKey: string) => request<InventorySession>(`/api/inventory-sessions/${encodeURIComponent(sessionKey)}`),
  listSessions: () => request<any[]>("/api/inventory-sessions"),
  closeSession: (sessionKey: string) => request<{ ok: boolean; session: InventorySession }>(`/api/inventory-sessions/${encodeURIComponent(sessionKey)}/close`, { method: "POST" }),
  listStations: () => request<Station[]>("/api/stations"),
  saveStation: (stationKey: string, body: { name?: string; type?: string; inputMode?: string; deviceLabel?: string; config?: Record<string, unknown> }) =>
    request<{ ok: boolean; station: Station }>(`/api/stations/${encodeURIComponent(stationKey)}`, { method: "PUT", body: JSON.stringify(body) }),
  unknownTags: () => request<any[]>("/api/reports/unknown-tags"),
  itemsLastSeen: () => request<any[]>("/api/reports/items-last-seen"),
  backup: () => request<{ ok: boolean; backup: { path: string } }>("/api/admin/backup", { method: "POST" }),
  seedDemo: () => request<{ ok: boolean; inserted: boolean }>("/api/admin/seed-demo", { method: "POST" }),
  postRead: (body: { epc: string; sessionId?: string; stationId?: string; source?: string }) =>
    request<{ ok: boolean; epc: string; known: boolean; item: Item | null }>("/api/rfid/browser-read", { method: "POST", body: JSON.stringify({ source: "browser-hid", seenAt: new Date().toISOString(), ...body }) })
};
