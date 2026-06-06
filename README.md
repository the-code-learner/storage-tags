# Storage Tags

Storage Tags is a local browser-based UHF RFID inventory system. It is designed for the Scenario B architecture: the RFID reader is connected to the operator device, the browser captures EPC values, and the local backend stores normalized reads in SQLite.

## What It Does

- Registers RFID EPC tags and associates them with inventory items.
- Runs inventory sessions for boxes, shelves, or containers.
- Accepts browser HID keyboard RFID input as the first MVP reader mode.
- Deduplicates repeated reads per inventory session.
- Shows known items, unknown tags, read counts, and confidence labels.
- Lets operators register unknown tags, mark them as external, or ignore them.
- Saves browser station settings for RFID input devices.
- Creates local SQLite backups.
- Loads demo data for testing without a physical RFID reader.
- Exports saved session results as CSV.

## Architecture

The data path is:

```text
RFID Reader -> Browser -> Fastify API -> SQLite
```

The backend does not need direct USB access to the reader. A low-cost USB-C, USB-A, OTG, or Bluetooth HID RFID reader can type EPC codes into the browser, and the frontend forwards those codes to the API.

## Requirements

- Node.js 24 or newer
- npm
- Docker and Docker Compose, optional for containerized usage

This project currently uses Node's built-in SQLite API, so no native npm SQLite package or Visual Studio C++ build tools are required for local development.

## Install

```bash
npm install
```

## Run In Development

```bash
npm run dev
```

Development starts two services:

- API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

The Vite frontend proxies `/api` requests to the Fastify backend.

## Build

```bash
npm run build
```

The frontend is built into `public/`, and the TypeScript backend is built into `dist/`.

## Run The Production Build

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Run With Docker

```bash
docker compose up --build
```

The app is exposed at:

```text
http://localhost:3000
```

SQLite data is stored in the local `data/` directory through the Docker volume mapping.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Fastify bind host |
| `PORT` | `3000` | Fastify port |
| `DATABASE_URL` | `data/inventory.sqlite` | SQLite database file |
| `NODE_ENV` | `development` | Enables static frontend serving when set to `production` |
| `RFID_INPUT_MODE` | `browser` in Docker Compose | Documents the intended reader mode |
| `APP_BASE_URL` | `http://localhost:3000` in Docker Compose | Public base URL hint |

## Main Pages

- `Dashboard`: review inventory activity, open sessions, and unknown tags.
- `Inventory`: start and stop container inventory sessions.
- `Register Tag`: scan an EPC and associate it with a new item.
- `Items`: create, edit, and archive inventory items.
- `Sessions`: reopen saved inventory sessions.
- `Reader`: test HID keyboard input, inspect raw input, and save station settings.
- `Reports`: review unknown tags and item last-seen data.

## RFID Reader Usage

1. Connect the RFID reader to the operator device.
2. Open the app in a browser.
3. Go to `Reader`, `Register Tag`, or `Inventory`.
4. Make sure the browser page is active.
5. Scan a tag.
6. The reader should type the EPC and usually submit it with Enter or Tab.

For Android devices, the reader must be supported as USB OTG, Bluetooth HID, or another keyboard-like input device.

## API Overview

- `GET /api/health`
- `GET /api/items`
- `POST /api/items`
- `GET /api/items/:id`
- `PUT /api/items/:id`
- `DELETE /api/items/:id`
- `GET /api/tags`
- `GET /api/tags/:epc`
- `POST /api/tags/register`
- `PUT /api/tags/:epc/status`
- `POST /api/tags/mark-unknown`
- `POST /api/rfid/browser-read`
- `POST /api/rfid/batch-browser-read`
- `GET /api/inventory-sessions`
- `POST /api/inventory-sessions`
- `GET /api/inventory-sessions/:sessionKey`
- `POST /api/inventory-sessions/:sessionKey/close`
- `GET /api/stations`
- `POST /api/stations`
- `GET /api/stations/:stationKey`
- `PUT /api/stations/:stationKey`
- `GET /api/reports/unknown-tags`
- `GET /api/reports/items-last-seen`
- `GET /api/reports/session/:sessionKey/csv`
- `POST /api/admin/backup`
- `POST /api/admin/seed-demo`

## Testing Without A Reader

1. Start the app.
2. Click `Load Demo Data`.
3. Open `Inventory`.
4. Start a session.
5. Use the demo scan buttons to simulate known and unknown RFID reads.
6. Open `Reports` to review unknown tags and last-seen item data.

The demo EPC values are:

```text
3034257BF7194E4000001A85
3034257BF7194E4000001A86
E2806894000040178F2A91B5
```

## Backups

Click `Create Backup` in the sidebar or call:

```bash
curl -X POST http://localhost:3000/api/admin/backup \
  -H "Content-Type: application/json" \
  -d "{}"
```

Backups are written under:

```text
data/backups/
```

## License

This project uses a custom source-available license. Free non-commercial use is allowed. Commercial use is reserved exclusively to the copyright holder. See [LICENSE](LICENSE) for the full terms.
