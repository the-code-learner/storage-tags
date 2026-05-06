import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createDb } from "./db/connection.js";
import { createItemsService } from "./modules/items/items.service.js";
import { createRfidService } from "./modules/rfid/rfid.service.js";
import type { RfidReadEvent, RfidSource } from "./modules/rfid/rfid.types.js";
import { createSessionsService } from "./modules/sessions/sessions.service.js";
import { createTagsService } from "./modules/tags/tags.service.js";
import { nowIso } from "./utils/time.js";

const app = Fastify({ logger: true });
const db = createDb();
const items = createItemsService(db);
const tags = createTagsService(db);
const sessions = createSessionsService(db);
const rfid = createRfidService(db);

await app.register(cors, { origin: true });

app.get("/api/health", async () => ({ ok: true, service: "storage-tags", time: nowIso() }));

app.get<{ Querystring: { search?: string } }>("/api/items", async (request) => items.list(request.query.search));
app.post<{ Body: { sku?: string; name?: string; description?: string; category?: string; photoUrl?: string; notes?: string } }>("/api/items", async (request, reply) => {
  if (!request.body.name?.trim()) return reply.code(400).send({ ok: false, error: "NAME_REQUIRED" });
  return { ok: true, item: items.create({ ...request.body, name: request.body.name.trim() }) };
});

app.get<{ Params: { epc: string } }>("/api/tags/:epc", async (request) => {
  const tag = tags.resolve(request.params.epc);
  return { ok: true, known: Boolean(tag), tag };
});

app.post<{ Body: { epc?: string; itemId?: number; tid?: string } }>("/api/tags/register", async (request, reply) => {
  if (!request.body.epc || !request.body.itemId) return reply.code(400).send({ ok: false, error: "EPC_AND_ITEM_REQUIRED" });
  const result = tags.register(request.body.epc, request.body.itemId, request.body.tid);
  return result.ok ? result : reply.code(400).send(result);
});

app.post<{ Body: Partial<RfidReadEvent> }>("/api/rfid/browser-read", async (request, reply) => {
  if (!request.body.epc) return reply.code(400).send({ ok: false, error: "EPC_REQUIRED" });
  const event: RfidReadEvent = {
    epc: request.body.epc,
    tid: request.body.tid,
    source: (request.body.source ?? "browser-hid") as RfidSource,
    stationId: request.body.stationId,
    sessionId: request.body.sessionId,
    deviceLabel: request.body.deviceLabel,
    raw: request.body.raw,
    seenAt: request.body.seenAt ?? nowIso()
  };

  const result = rfid.processRead(event);
  return result.ok ? result : reply.code(400).send(result);
});

app.post<{ Body: { epcs?: string[]; source?: RfidSource; stationId?: string; sessionId?: string; deviceLabel?: string } }>("/api/rfid/batch-browser-read", async (request, reply) => {
  if (!Array.isArray(request.body.epcs)) return reply.code(400).send({ ok: false, error: "EPCS_REQUIRED" });

  const results = request.body.epcs.map((epc) => rfid.processRead({
    epc,
    source: request.body.source ?? "browser-hid",
    stationId: request.body.stationId,
    sessionId: request.body.sessionId,
    deviceLabel: request.body.deviceLabel,
    seenAt: nowIso()
  }));

  return { ok: true, results };
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

app.get<{ Params: { sessionKey: string } }>("/api/reports/session/:sessionKey/csv", async (request, reply) => {
  const session = sessions.get(request.params.sessionKey);
  if (!session) return reply.code(404).send({ ok: false, error: "SESSION_NOT_FOUND" });

  const rows = [
    ["EPC", "Item Name", "SKU", "Category", "Read Count", "First Seen", "Last Seen"],
    ...session.reads.map((read: any) => [
      read.epc,
      read.item_name ?? "Unknown tag",
      read.item_sku ?? "",
      read.item_category ?? "",
      read.read_count,
      read.first_seen_at ?? "",
      read.last_seen_at ?? ""
    ])
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");

  return reply.header("content-type", "text/csv").send(csv);
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
