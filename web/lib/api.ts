export type TagTechnology = "nfc" | "uhf-rain";
export type AuthStatus = "not-requested" | "pending" | "verified" | "failed" | "replay" | "unsupported" | "error";
export type TamperStatus = "unknown" | "sealed" | "open" | "closed" | "opened-once" | "invalid";

export type Item = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  notes: string | null;
  status?: string;
  tag_count?: number;
  nfc_tag_count?: number;
  uhf_tag_count?: number;
  tags?: Tag[];
};

export type Tag = {
  id: number;
  technology: TagTechnology;
  identifier: string;
  epc: string | null;
  tid: string | null;
  uid: string | null;
  manufacturer: string | null;
  chip_family: string | null;
  chip_model: string | null;
  product_family: string | null;
  part_number: string | null;
  capabilities_json: string | null;
  metadata_json: string | null;
  item_id: number | null;
  item_name?: string | null;
  item_sku?: string | null;
  item_category?: string | null;
  security_profile_key?: string | null;
  status: string;
  last_auth_status: AuthStatus;
  last_auth_counter: number | null;
  last_tamper_status: TamperStatus;
  permanent_tamper_status: TamperStatus;
  last_seen_at: string | null;
};

export type TagCatalogEntry = {
  key: string;
  label: string;
  technology: TagTechnology;
  manufacturer?: string;
  chipFamily?: string;
  chipModel?: string;
  productFamily?: string;
  partNumber?: string;
  capabilities: Record<string, boolean>;
  notes?: string;
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
  technology: TagTechnology;
  identifier: string;
  read_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  item_name: string | null;
  item_sku: string | null;
  item_category: string | null;
  chip_model: string | null;
  product_family: string | null;
  auth_status: AuthStatus;
  tamper_status: TamperStatus;
  permanent_tamper_status: TamperStatus;
};

export type TagEvent = {
  id: number;
  event_kind: string;
  technology: TagTechnology;
  identifier: string;
  source: string;
  auth_status: AuthStatus;
  auth_counter: number | null;
  tamper_status: TamperStatus;
  permanent_tamper_status: TamperStatus;
  occurred_at: string;
  item_name?: string | null;
  item_sku?: string | null;
  chip_model?: string | null;
  product_family?: string | null;
};

export type InventorySession = {
  id: number;
  session_key: string;
  station_key?: string | null;
  station_name?: string | null;
  container_code: string | null;
  location_name: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  reads: SessionRead[];
  events: TagEvent[];
};

export type SecurityProfile = {
  profile_key: string;
  name: string;
  technology: TagTechnology;
  verifier: "ntag22x-sun" | "ntag424-sdm" | "reader-bridge";
  key_ref: string | null;
  config_json: string | null;
  status: string;
};

export type DashboardSummary = {
  counts: {
    active_items: number;
    active_tags: number;
    nfc_tags: number;
    uhf_tags: number;
    open_sessions: number;
    auth_alerts: number;
    tamper_alerts: number;
    secured_tags: number;
  };
  recentEvents: TagEvent[];
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

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  health: () => request<{ ok: boolean; version: string; time: string; capabilities: string[] }>("/api/health"),
  dashboard: () => request<DashboardSummary>("/api/reports/dashboard"),

  listItems: (search = "") => request<Item[]>(`/api/items${query({ search })}`),
  getItem: (id: number) => request<Item>(`/api/items/${id}`),
  createItem: (body: Partial<Item> & { name: string; photoUrl?: string }) => request<{ ok: boolean; item: Item }>("/api/items", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: Partial<Item> & { photoUrl?: string }) => request<{ ok: boolean; item: Item }>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteItem: (id: number) => request<{ ok: boolean }>(`/api/items/${id}`, { method: "DELETE" }),

  tagCatalog: () => request<TagCatalogEntry[]>("/api/tag-catalog"),
  listTags: (filters: { status?: string; technology?: TagTechnology; search?: string } = {}) => request<Tag[]>(`/api/tags${query(filters)}`),
  resolveTag: (technology: TagTechnology, identifier: string) => request<{ ok: boolean; known: boolean; tag: Tag | null }>(`/api/tags/${technology}/${encodeURIComponent(identifier)}`),
  registerTag: (body: {
    technology: TagTechnology; identifier: string; itemId?: number; epc?: string; tid?: string; uid?: string;
    catalogKey?: string; securityProfileKey?: string; status?: string; metadata?: Record<string, unknown>;
  }) => request<{ ok: boolean; tag: Tag }>("/api/tags", { method: "POST", body: JSON.stringify(body) }),
  setTagStatus: (technology: TagTechnology, identifier: string, status: "active" | "inactive" | "ignored" | "external") =>
    request<{ ok: boolean; tag: Tag }>(`/api/tags/${technology}/${encodeURIComponent(identifier)}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  markUnknownTag: (technology: TagTechnology, identifier: string, status: "ignored" | "external") =>
    request<{ ok: boolean; tag: Tag }>("/api/tags/mark-unknown", { method: "POST", body: JSON.stringify({ technology, identifier, status }) }),

  postObservation: (body: {
    technology: TagTechnology; identifier: string; epc?: string; tid?: string; uid?: string;
    source: "browser-hid" | "browser-webnfc" | "reader-bridge" | "mock"; stationKey?: string; sessionKey?: string;
    rssi?: number; antenna?: number; raw?: string; ndefUrl?: string; payload?: Record<string, unknown>;
  }) => request<any>("/api/observations", { method: "POST", body: JSON.stringify({ seenAt: new Date().toISOString(), ...body }) }),
  recentEvents: (limit = 100) => request<TagEvent[]>(`/api/events?limit=${limit}`),

  listSecurityProfiles: () => request<SecurityProfile[]>("/api/security/profiles"),
  saveSecurityProfile: (profileKey: string, body: {
    name: string; technology: TagTechnology; verifier: SecurityProfile["verifier"]; keyRef?: string;
    config?: Record<string, unknown>; status?: "active" | "inactive";
  }) => request<{ ok: boolean; profile: SecurityProfile }>(`/api/security/profiles/${encodeURIComponent(profileKey)}`, { method: "PUT", body: JSON.stringify(body) }),
  verifyTag: (body: {
    technology: TagTechnology; identifier: string; profileKey?: string; url?: string;
    source?: "browser-webnfc" | "reader-bridge" | "mock"; stationKey?: string; sessionKey?: string;
  }) => request<any>("/api/security/verify", { method: "POST", body: JSON.stringify(body) }),

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
  securityAlerts: (limit = 100) => request<Tag[]>(`/api/reports/security-alerts?limit=${limit}`),
  backup: () => request<{ ok: boolean; backup: { path: string } }>("/api/admin/backup", { method: "POST" }),
  seedDemo: () => request<{ ok: boolean; inserted: boolean }>("/api/admin/seed-demo", { method: "POST" })
};
