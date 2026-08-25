import readline from "node:readline";
import { createDb } from "./db/connection.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { createItemsService } from "./modules/items/items.service.js";
import { createObservationsService } from "./modules/observations/observations.service.js";
import { createReportsService } from "./modules/reports/reports.service.js";
import { createSecurityService } from "./modules/security/security.service.js";
import { createSessionsService } from "./modules/sessions/sessions.service.js";
import { createStationsService } from "./modules/stations/stations.service.js";
import { createTagsService } from "./modules/tags/tags.service.js";

const db = createDb();
const admin = createAdminService(db);
const items = createItemsService(db);
const observations = createObservationsService(db);
const reports = createReportsService(db);
const security = createSecurityService(db);
const sessions = createSessionsService(db);
const stations = createStationsService(db);
const tags = createTagsService(db);

const protocolVersion = "2025-06-18";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false
});

const tools: McpTool[] = [
  {
    name: "dashboard_summary",
    description: "Get operational totals, authentication/tamper alerts, and recent security events.",
    inputSchema: objectSchema()
  },
  {
    name: "list_items",
    description: "List inventory items and their NFC/RAIN tag counts.",
    inputSchema: objectSchema({ search: { type: "string" } })
  },
  {
    name: "get_item",
    description: "Get one inventory item including all linked NFC and RAIN tags.",
    inputSchema: objectSchema({ id: { type: "integer" } }, ["id"])
  },
  {
    name: "create_item",
    description: "Create an inventory item.",
    inputSchema: objectSchema({
      sku: { type: "string" }, name: { type: "string" }, description: { type: "string" },
      category: { type: "string" }, photoUrl: { type: "string" }, notes: { type: "string" }
    }, ["name"])
  },
  {
    name: "update_item",
    description: "Update an inventory item.",
    inputSchema: objectSchema({
      id: { type: "integer" }, sku: { type: "string" }, name: { type: "string" }, description: { type: "string" },
      category: { type: "string" }, photoUrl: { type: "string" }, notes: { type: "string" }
    }, ["id"])
  },
  {
    name: "archive_item",
    description: "Archive an item and deactivate its tags.",
    inputSchema: objectSchema({ id: { type: "integer" } }, ["id"])
  },
  {
    name: "tag_catalog",
    description: "List supported generic, NXP, and Identiv tag families with security capabilities.",
    inputSchema: objectSchema()
  },
  {
    name: "list_tags",
    description: "List or filter NFC and RAIN tags.",
    inputSchema: objectSchema({
      status: { type: "string" },
      technology: { type: "string", enum: ["nfc", "uhf-rain"] },
      search: { type: "string" }
    })
  },
  {
    name: "get_tag",
    description: "Resolve a tag by technology and identifier.",
    inputSchema: objectSchema({
      technology: { type: "string", enum: ["nfc", "uhf-rain"] }, identifier: { type: "string" }
    }, ["technology", "identifier"])
  },
  {
    name: "register_tag",
    description: "Register or update a generic NFC/RAIN tag and optionally link it to an item and security profile.",
    inputSchema: objectSchema({
      technology: { type: "string", enum: ["nfc", "uhf-rain"] }, identifier: { type: "string" }, itemId: { type: "integer" },
      epc: { type: "string" }, tid: { type: "string" }, uid: { type: "string" }, catalogKey: { type: "string" },
      manufacturer: { type: "string" }, chipFamily: { type: "string" }, chipModel: { type: "string" },
      productFamily: { type: "string" }, partNumber: { type: "string" }, securityProfileKey: { type: "string" },
      metadata: { type: "object" }, status: { type: "string", enum: ["active", "inactive", "ignored", "external"] }
    }, ["technology", "identifier"])
  },
  {
    name: "set_tag_status",
    description: "Set a tag lifecycle status.",
    inputSchema: objectSchema({
      technology: { type: "string", enum: ["nfc", "uhf-rain"] }, identifier: { type: "string" },
      status: { type: "string", enum: ["active", "inactive", "ignored", "external"] }
    }, ["technology", "identifier", "status"])
  },
  {
    name: "ingest_observation",
    description: "Record an NFC or RAIN observation, optionally linked to an open inventory session.",
    inputSchema: objectSchema({
      technology: { type: "string", enum: ["nfc", "uhf-rain"] }, identifier: { type: "string" },
      epc: { type: "string" }, tid: { type: "string" }, uid: { type: "string" },
      source: { type: "string", enum: ["browser-hid", "browser-webnfc", "reader-bridge", "mock"] },
      stationKey: { type: "string" }, sessionKey: { type: "string" }, rssi: { type: "number" }, antenna: { type: "integer" },
      raw: { type: "string" }, ndefUrl: { type: "string" }, payload: { type: "object" }, sensorValue: { type: "number" }, sensorUnit: { type: "string" }
    }, ["technology", "identifier", "source"])
  },
  {
    name: "recent_events",
    description: "Read immutable scan, verification, tamper, and sensor events.",
    inputSchema: objectSchema({ limit: { type: "integer", minimum: 1, maximum: 500 } })
  },
  {
    name: "list_security_profiles",
    description: "List self-hosted verification profiles. Returns key references only, never key material.",
    inputSchema: objectSchema()
  },
  {
    name: "upsert_security_profile",
    description: "Create or update a verification profile using a server-side key reference.",
    inputSchema: objectSchema({
      profileKey: { type: "string" }, name: { type: "string" }, technology: { type: "string", enum: ["nfc", "uhf-rain"] },
      verifier: { type: "string", enum: ["ntag22x-sun", "ntag424-sdm", "reader-bridge"] }, keyRef: { type: "string" },
      config: { type: "object" }, status: { type: "string", enum: ["active", "inactive"] }
    }, ["profileKey", "name", "technology", "verifier"])
  },
  {
    name: "verify_tag",
    description: "Perform self-hosted SUN/SDM verification, replay detection, and tamper/status capture.",
    inputSchema: objectSchema({
      technology: { type: "string", enum: ["nfc", "uhf-rain"] }, identifier: { type: "string" }, profileKey: { type: "string" },
      url: { type: "string" }, source: { type: "string", enum: ["browser-hid", "browser-webnfc", "reader-bridge", "mock"] },
      stationKey: { type: "string" }, sessionKey: { type: "string" }, evidence: { type: "object" }
    }, ["technology", "identifier"])
  },
  {
    name: "list_sessions",
    description: "List inventory sessions with NFC/RAIN/security metrics.",
    inputSchema: objectSchema()
  },
  {
    name: "get_session",
    description: "Get a session including aggregated observations and immutable events.",
    inputSchema: objectSchema({ sessionKey: { type: "string" } }, ["sessionKey"])
  },
  {
    name: "create_session",
    description: "Create an inventory session.",
    inputSchema: objectSchema({ stationKey: { type: "string" }, containerCode: { type: "string" }, locationName: { type: "string" }, notes: { type: "string" } })
  },
  {
    name: "close_session",
    description: "Close an inventory session.",
    inputSchema: objectSchema({ sessionKey: { type: "string" } }, ["sessionKey"])
  },
  {
    name: "list_stations",
    description: "List browser and reader-bridge stations.",
    inputSchema: objectSchema()
  },
  {
    name: "save_station",
    description: "Create or update a station/reader endpoint.",
    inputSchema: objectSchema({
      stationKey: { type: "string" }, name: { type: "string" }, type: { type: "string" }, inputMode: { type: "string" },
      deviceLabel: { type: "string" }, config: { type: "object" }
    }, ["stationKey", "name"])
  },
  {
    name: "unknown_tags_report",
    description: "List observed identifiers that do not have an active registered tag.",
    inputSchema: objectSchema()
  },
  {
    name: "items_last_seen_report",
    description: "Report last-seen data per item/tag identity.",
    inputSchema: objectSchema()
  },
  {
    name: "security_alerts_report",
    description: "List authentication failures/replays and tamper alerts.",
    inputSchema: objectSchema({ limit: { type: "integer", minimum: 1, maximum: 500 } })
  },
  {
    name: "create_backup",
    description: "Create a local SQLite backup on the Storage Tags host.",
    inputSchema: objectSchema()
  },
  {
    name: "seed_demo",
    description: "Load non-secret demo inventory and tag records when the database is empty.",
    inputSchema: objectSchema()
  }
];

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {})
  };
}

function callTool(name: string, args: any) {
  switch (name) {
    case "dashboard_summary": return reports.dashboardSummary();
    case "list_items": return items.list(args.search);
    case "get_item": return items.get(Number(args.id));
    case "create_item": return items.create(args);
    case "update_item": {
      const { id, ...input } = args;
      return items.update(Number(id), input);
    }
    case "archive_item": return { archived: items.remove(Number(args.id)) };
    case "tag_catalog": return tags.catalog();
    case "list_tags": return tags.list(args);
    case "get_tag": return tags.resolve(args.technology, args.identifier);
    case "register_tag": return tags.register(args);
    case "set_tag_status": return tags.setStatus(args.technology, args.identifier, args.status);
    case "ingest_observation": return observations.process(args);
    case "recent_events": return observations.recentEvents(Number(args.limit ?? 100));
    case "list_security_profiles": return security.listProfiles();
    case "upsert_security_profile": return security.upsertProfile(args);
    case "verify_tag": return security.verify(args);
    case "list_sessions": return sessions.list();
    case "get_session": return sessions.get(args.sessionKey);
    case "create_session": return sessions.create(args);
    case "close_session": return sessions.close(args.sessionKey);
    case "list_stations": return stations.list();
    case "save_station": return stations.upsert(args);
    case "unknown_tags_report": return reports.unknownTags();
    case "items_last_seen_report": return reports.itemsLastSeen();
    case "security_alerts_report": return reports.securityAlerts(Number(args.limit ?? 100));
    case "create_backup": return admin.backup();
    case "seed_demo": return admin.seedDemoData();
    default: throw new Error("UNKNOWN_TOOL");
  }
}

function send(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function success(id: JsonRpcRequest["id"], result: unknown) {
  if (id === undefined) return;
  send({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcRequest["id"], code: number, message: string) {
  if (id === undefined) return;
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(request: JsonRpcRequest) {
  try {
    if (request.method === "initialize") {
      return success(request.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "storage-tags", version: "0.0.1" }
      });
    }

    if (request.method === "notifications/initialized" || request.method === "notifications/cancelled") return;
    if (request.method === "ping") return success(request.id, {});
    if (request.method === "tools/list") return success(request.id, { tools });

    if (request.method === "tools/call") {
      const name = request.params?.name;
      const args = request.params?.arguments ?? {};
      if (typeof name !== "string") return failure(request.id, -32602, "Tool name is required");

      try {
        return success(request.id, toolResult(callTool(name, args)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return success(request.id, toolResult({ ok: false, error: message }, true));
      }
    }

    return failure(request.id, -32601, `Method not found: ${request.method}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(request.id, -32603, message);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    void handle(JSON.parse(trimmed) as JsonRpcRequest);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
});
