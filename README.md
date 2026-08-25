# Storage Tags

Storage Tags is a self-hosted inventory and tag-authentication platform for mixed **RAIN/UHF RFID** and **NFC** workflows. It supports bulk UHF inventory, point NFC verification, tag security/tamper state, local SQLite storage, a browser UI, REST APIs, and an MCP stdio server.

Current development version: **0.0.1**.

## Core capabilities

- Register multiple tag identities against one inventory item, including both UHF EPCs and NFC UIDs.
- Run inventory sessions that aggregate RAIN/UHF reads and NFC point checks in the same audit context.
- Capture UHF readers that behave as keyboard/HID devices.
- Capture NDEF-compatible NFC tags through Web NFC where the browser supports it.
- Store immutable scan, verification, tamper, and sensor events alongside aggregated session observations.
- Perform self-hosted NTAG DNA SUN/SDM verification without a managed verification service.
- Detect replayed SUN/SDM messages by tracking verified counters.
- Track current and permanent/once-opened tamper state where the tag family exposes it.
- Reference AES keys through server-side secret files rather than storing key material in application data.
- Expose the application domain to MCP clients through a stdio MCP server.
- Keep a reader-bridge boundary for low-level NFC operations and authenticated RAIN readers.

## Tag families represented in the catalog

The capability catalog currently includes:

- generic NFC / NDEF;
- generic RAIN / UHF;
- NXP NTAG 223 DNA;
- NXP NTAG 224 DNA;
- NXP NTAG 223 / 224 DNA StatusDetect;
- NXP NTAG 424 DNA and NTAG 424 DNA TagTamper;
- Identiv NTAG 22x DNA portfolio entries;
- Identiv ID-NXP NTAG 424 DNA TT family;
- NXP UCODE DNA;
- NXP UCODE DNA Track;
- NXP UCODE Guard.

Catalog presence describes capabilities and product identity. Full cryptographic operation still depends on the actual tag configuration and, for low-level operations, a compatible reader.

## Architecture

```text
RAIN HID reader ───────┐
                       ├─> Browser UI ──> Fastify REST API ──> Domain services ──> SQLite
Android Web NFC ───────┘                         │
                                                ├─> self-hosted SUN / SDM verification
Authenticated reader bridge ────────────────────┘

MCP client ──stdio──> Storage Tags MCP server ──> same domain services ──> SQLite
```

The data model is technology-aware rather than EPC-only. A tag is keyed by `(technology, identifier)` and can carry transport-specific fields such as EPC, TID, or UID.

## Web NFC and reader bridge

Web NFC is used only for browser-accessible NDEF flows. It is suitable for reading dynamic SUN/SDM URLs on supported Android browsers, but it is not treated as a replacement for low-level NFC commands, protected-memory access, or mutual authentication.

Those operations, plus UCODE DNA authenticated challenge-response, belong behind the `reader-bridge` adapter. No USB NFC or authenticated RAIN reader model is hard-coded yet.

## Requirements

- Node.js 24 or newer
- npm
- Linux is the primary server target
- Docker / Docker Compose optional

The intended deployment targets include conventional Linux hosts, Proxmox VMs/LXCs, and Docker.

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

Development starts:

- API: `http://localhost:3000`
- frontend: `http://localhost:5173`

The Vite frontend proxies `/api` requests to the Fastify backend.

## Test and build

```bash
npm test
npm run build
```

Pull requests are expected to pass both commands in GitHub Actions before merge.

## Production

```bash
npm run build
npm start
```

Then open `http://localhost:3000`.

With Docker:

```bash
docker compose up --build
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Fastify bind host |
| `PORT` | `3000` | Fastify port |
| `DATABASE_URL` | `data/inventory.sqlite` | SQLite database file |
| `NODE_ENV` | `development` | Runtime mode |
| `STORAGE_TAGS_KEYS_DIR` | `/run/secrets/storage-tags` | Base directory for server-side tag verification keys |

Verification profiles store a **key reference** such as `production/oil-sdm-file-read.key`. They do not store the AES key itself. A key file may contain either 16 raw bytes or 32 hexadecimal characters.

## Main UI surfaces

- **Dashboard** — operational metrics, security exceptions, reader readiness, recent immutable events.
- **Inventory** — mixed RAIN/NFC session capture and CSV export.
- **Tags** — generic tag registry, product family, item assignment, security-profile assignment.
- **Items** — inventory item lifecycle and linked-tag counts.
- **Security** — SUN/SDM/reader-bridge profiles, replay/tamper alerts, point verification.
- **Readers** — HID, Web NFC and reader-bridge station configuration.
- **Sessions** — session history with NFC/UHF/security metrics.
- **Reports** — unknown identifiers, last-seen data and immutable security event history.

## REST API overview

### Items

- `GET /api/items`
- `GET /api/items/:id`
- `POST /api/items`
- `PUT /api/items/:id`
- `DELETE /api/items/:id`

### Tags and observations

- `GET /api/tag-catalog`
- `GET /api/tags`
- `GET /api/tags/:technology/:identifier`
- `POST /api/tags`
- `PUT /api/tags/:technology/:identifier/status`
- `POST /api/tags/mark-unknown`
- `POST /api/observations`
- `POST /api/observations/batch`
- `GET /api/events`

`POST /api/rfid/browser-read` remains as a compatibility adapter for browser-HID UHF reads.

### Security

- `GET /api/security/profiles`
- `PUT /api/security/profiles/:profileKey`
- `POST /api/security/verify`

### Inventory and stations

- `GET /api/inventory-sessions`
- `POST /api/inventory-sessions`
- `GET /api/inventory-sessions/:sessionKey`
- `POST /api/inventory-sessions/:sessionKey/close`
- `GET /api/stations`
- `GET /api/stations/:stationKey`
- `POST /api/stations`
- `PUT /api/stations/:stationKey`

### Reports and administration

- `GET /api/reports/dashboard`
- `GET /api/reports/unknown-tags`
- `GET /api/reports/items-last-seen`
- `GET /api/reports/security-alerts`
- `GET /api/reports/session/:sessionKey/csv`
- `POST /api/admin/backup`
- `POST /api/admin/seed-demo`

## MCP server

After building the project:

```bash
npm run mcp
```

The MCP server communicates over stdio and exposes the same domain operations used by the REST/UI layers: dashboard summary, items, tags, observations, immutable events, security profiles and verification, sessions, stations, reports, backup, and demo seeding.

Key material is never returned as an MCP result. Security tools expose only profile metadata and key references.

## Demo data

The demo seed contains non-secret inventory records with mixed UHF/NFC identities. It intentionally does not configure verification keys.

## Development workflow

Feature work is developed on branches and submitted through pull requests. `CHANGELOG.md` is maintained from version `0.0.1`; release tags are created only after the corresponding pull request passes tests, is reviewed, and is merged.

## License

This project uses a custom source-available license. Free non-commercial use is allowed. Commercial use is reserved exclusively to the copyright holder. See [LICENSE](LICENSE) for the full terms.
