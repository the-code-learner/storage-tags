import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createDb } from "./db/connection.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { createItemsService } from "./modules/items/items.service.js";
import { createObservationsService } from "./modules/observations/observations.service.js";
import { createReportsService } from "./modules/reports/reports.service.js";
import { createSecurityService, type SecurityProfileInput, type VerifyInput } from "./modules/security/security.service.js";
import { createSessionsService } from "./modules/sessions/sessions.service.js";
import { createStationsService } from "./modules/stations/stations.service.js";
import { createTagsService } from "./modules/tags/tags.service.js";
import type { RegisterTagInput, TagObservationInput, TagStatus, TagTechnology } from "./modules/tags/tag.types.js";
import { nowIso } from "./utils/time.js";

const app = Fastify({ logger: true });
const db = createDb();
const items = createItemsService(db);
const tags = createTagsService(db);
const sessions = createSessionsService(db);
const observations = createObservationsService(db);
const security = createSecurityService(db);
const stations = createStationsService(db);
const reports = createReportsService(db);
const admin = createAdminService(db);

await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  service: "storage-tags",
  version: "0.0.1",
  time: nowIso(),
  capabilities: ["uhf-rain", "nfc", "sun", "sdm", "tamper", "security-profiles", "reader-bridge"]
}));

app.get<{ Querystring: { search?: string } }>("/api/items", async (request) => items.list(request.query.search));
app.get<{ Params: { id: string } }>("/api/items/:id", async (request, reply) => {
  const item = items.get(Number(request.params.id));
  return item ? item : reply.code(404).send({ ok: false, error: "ITEM_NOT_FOUND" });
});
app.post<{ Body: { sku?: string; name?: string; description?: string; category?: string; photoUrl?: string; notes?: string } }>("/api/items", async (request, reply) => {
  if (!request.body.name?.trim()) return reply.code(400).send({ ok: false, error: "NAME_REQUIRED" });
  return { ok: true, item: items.create({ ...request.body, name: request.body.name.trim() }) };
});
app.put<{ Params: { id: string }; Body: { sku?: string; name?: string; description?: string; category?: string; photoUrl?: string; notes?: string } }>("/api/items/:id", async (request, reply) => {
  if (request.body.name !== undefined && !request.body.name.trim()) return reply.code(400).send({ ok: false, error: "NAME_REQUIRED" });
  const item = items.update(Number(request.params.id), request.body);
  return item ? { ok: true, item } : reply.code(404).send({ ok: false, error: "ITEM_NOT_FOUND" });
});
app.delete<{ Params: { id: string } }>("/api/items/:id", async (request, reply) => {
  return items.remove(Number(request.params.id)) ? { ok: true } : reply.code(404).send({ ok: false, error: "ITEM_NOT_FOUND" });
});

app.get("/api/tag-catalog", async () => tags.catalog());
app.get<{ Querystring: { status?: string; technology?: TagTechnology; search?: string } }>("/api/tags", async (request) => tags.list(request.query));
app.get<{ Params: { technology: TagTechnology; identifier: string } }>("/api/tags/:technology/:identifier", async (request) => {
  const tag = tags.resolve(request.params.technology, request.params.identifier);
  return { ok: true, known: Boolean(tag), tag };
});
app.post<{ Body: RegisterTagInput }>("/api/tags", async (request, reply) => {
  if (!request.body.technology || !request.body.identifier) return reply.code(400).send({ ok: false, error: "TECHNOLOGY_AND_IDENTIFIER_REQUIRED" });
  const result = tags.register(request.body);
  return result.ok ? result : reply.code(400).send(result);
});
app.put<{ Params: { technology: TagTechnology; identifier: string }; Body: { status?: TagStatus } }>("/api/tags/:technology/:identifier/status", async (request, reply) => {
  if (!request.body.status) return reply.code(400).send({ ok: false, error: "STATUS_REQUIRED" });
  const result = tags.setStatus(request.params.technology, request.params.identifier, request.body.status);
  return result.ok ? result : reply.code(400).send(result);
});
app.post<{ Body: { technology?: TagTechnology; identifier?: string; status?: "ignored" | "external" } }>("/api/tags/mark-unknown", async (request, reply) => {
  if (!request.body.technology || !request.body.identifier || !request.body.status) return reply.code(400).send({ ok: false, error: "TECHNOLOGY_IDENTIFIER_AND_STATUS_REQUIRED" });
  const result = tags.markUnknown(request.body.technology, request.body.identifier, request.body.status);
  return result.ok ? result : reply.code(400).send(result);
});

app.post<{ Body: TagObservationInput }>("/api/observations", async (request, reply) => {
  if (!request.body.technology || !request.body.identifier || !request.body.source) return reply.code(400).send({ ok: false, error: "TECHNOLOGY_IDENTIFIER_AND_SOURCE_REQUIRED" });
  const result = observations.process(request.body);
  return result.ok ? result : reply.code(400).send(result);
});
app.post<{ Body: { observations?: TagObservationInput[] } }>("/api/observations/batch", async (request, reply) => {
  if (!Array.isArray(request.body.observations)) return reply.code(400).send({ ok: false, error: "OBSERVATIONS_REQUIRED" });
  return { ok: true, results: request.body.observations.map((entry) => observations.process(entry)) };
});
app.get<{ Querystring: { limit?: string } }>("/api/events", async (request) => observations.recentEvents(Number(request.query.limit ?? 100)));

app.get("/api/security/profiles", async () => security.listProfiles());
app.put<{ Params: { profileKey: string }; Body: Omit<SecurityProfileInput, "profileKey"> }>("/api/security/profiles/:profileKey", async (request, reply) => {
  if (!request.body.name || !request.body.technology || !request.body.verifier) return reply.code(400).send({ ok: false, error: "PROFILE_FIELDS_REQUIRED" });
  return { ok: true, profile: security.upsertProfile({ ...request.body, profileKey: request.params.profileKey }) };
});
app.post<{ Body: VerifyInput }>("/api/security/verify", async (request, reply) => {
  if (!request.body.technology || !request.body.identifier) return reply.code(400).send({ ok: false, error: "TECHNOLOGY_AND_IDENTIFIER_REQUIRED" });
  try {
    const result = security.verify(request.body);
    return result.ok ? result : reply.code(400).send(result);
  } catch (error) {
    request.log.error(error);
    const message = error instanceof Error ? error.message : "VERIFICATION_ERROR";
    return reply.code(400).send({ ok: false, error: message });
  }
});

app.post<{ Body: { epc?: string; tid?: string; source?: string; stationId?: string; sessionId?: string; rssi?: number; antenna?: number; raw?: string; seenAt?: string } }>("/api/rfid/browser-read", async (request, reply) => {
  if (!request.body.epc) return reply.code(400).send({ ok: false, error: "EPC_REQUIRED" });
  const result = observations.process({
    technology: "uhf-rain",
    identifier: request.body.epc,
    epc: request.body.epc,
    tid: request.body.tid,
    source: "browser-hid",
    stationKey: request.body.stationId,
    sessionKey: request.body.sessionId,
    rssi: request.body.rssi,
    antenna: request.body.antenna,
    raw: request.body.raw,
    seenAt: request.body.seenAt ?? nowIso()
  });
  return result.ok ? { ...result, deprecatedRoute: true } : reply.code(400).send(result);
});

app.get("/api/inventory-sessions", async () => sessions.list());
app.post<{ Body: { stationKey?: string; containerCode?: string; locationName?: string; notes?: string } }>("/api/inventory-sessions", async (request) => ({ ok: true, session: sessions.create(request.body) }));
app.get<{ Params: { sessionKey: string } }>("/api/inventory-sessions/:sessionKey", async (request, reply) => {
  const session = sessions.get(request.params.sessionKey);
  return session ? session : reply.code(404).send({ ok: false, error: "SESSION_NOT_FOUND" });
});
app.post<{ Params: { sessionKey: string } }>("/api/inventory-sessions/:sessionKey/close", async (request, reply) => {
  const session = sessions.close(request.params.sessionKey);
  return session ? { ok: true, session } : reply.code(404).send({ ok: false, error: "SESSION_NOT_FOUND" });
});

app.get("/api/stations", async () => stations.list());
app.get<{ Params: { stationKey: string } }>("/api/stations/:stationKey", async (request, reply) => {
  const station = stations.get(request.params.stationKey);
  return station ? station : reply.code(404).send({ ok: false, error: "STATION_NOT_FOUND" });
});
app.put<{ Params: { stationKey: string }; Body: { name?: string; type?: string; inputMode?: string; deviceLabel?: string; config?: Record<string, unknown> } }>("/api/stations/:stationKey", async (request) => {
  const stationKey = request.params.stationKey.trim();
  const name = request.body.name?.trim() || stationKey;
  return { ok: true, station: stations.upsert({ ...request.body, stationKey, name }) };
});
app.post<{ Body: { stationKey?: string; name?: string; type?: string; inputMode?: string; deviceLabel?: string; config?: Record<string, unknown> } }>("/api/stations", async (request, reply) => {
  if (!request.body.stationKey?.trim()) return reply.code(400).send({ ok: false, error: "STATION_KEY_REQUIRED" });
  return { ok: true, station: stations.upsert({ ...request.body, stationKey: request.body.stationKey.trim(), name: request.body.name?.trim() || request.body.stationKey.trim() }) };
});

app.get("/api/reports/dashboard", async () => reports.dashboardSummary());
app.get("/api/reports/unknown-tags", async () => reports.unknownTags());
app.get("/api/reports/items-last-seen", async () => reports.itemsLastSeen());
app.get<{ Querystring: { limit?: string } }>("/api/reports/security-alerts", async (request) => reports.securityAlerts(Number(request.query.limit ?? 100)));
app.post("/api/admin/backup", async () => ({ ok: true, backup: admin.backup() }));
app.post("/api/admin/seed-demo", async () => ({ ok: true, ...admin.seedDemoData() }));

app.get<{ Params: { sessionKey: string } }>("/api/reports/session/:sessionKey/csv", async (request, reply) => {
  const session = sessions.get(request.params.sessionKey);
  if (!session) return reply.code(404).send({ ok: false, error: "SESSION_NOT_FOUND" });

  const rows = [
    ["Technology", "Identifier", "Item Name", "SKU", "Category", "Read Count", "Auth Status", "Current Tamper", "Permanent Tamper", "First Seen", "Last Seen"],
    ...session.reads.map((read: any) => [
      read.technology,
      read.identifier,
      read.item_name ?? "Unknown tag",
      read.item_sku ?? "",
      read.item_category ?? "",
      read.read_count,
      read.auth_status,
      read.tamper_status,
      read.permanent_tamper_status,
      read.first_seen_at ?? "",
      read.last_seen_at ?? ""
    ])
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");

  return reply
    .header("content-type", "text/csv")
    .header("content-disposition", `attachment; filename="${request.params.sessionKey}.csv"`)
    .send(csv);
});

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
if (config.nodeEnv === "production" || existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ host: config.host, port: config.port });
