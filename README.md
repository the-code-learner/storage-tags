# Storage Tags

Storage Tags is a local browser-based UHF RFID inventory system. It is designed for the Scenario B architecture: the RFID reader is connected to the operator device, the browser captures EPC values, and the local backend stores normalized reads in SQLite.

## What It Does

- Registers RFID EPC tags and associates them with inventory items.
- Runs inventory sessions for boxes, shelves, or containers.
- Accepts browser HID keyboard RFID input as the first MVP reader mode.
- Deduplicates repeated reads per inventory session.
- Shows known items, unknown tags, read counts, and confidence labels.
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

- `Inventory`: start and stop container inventory sessions.
- `Register Tag`: scan an EPC and associate it with a new item.
- `Items`: review created inventory items.
- `Sessions`: reopen saved inventory sessions.
- `Reader`: test HID keyboard input and inspect the raw scan buffer.

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
- `GET /api/tags/:epc`
- `POST /api/tags/register`
- `POST /api/rfid/browser-read`
- `POST /api/rfid/batch-browser-read`
- `GET /api/inventory-sessions`
- `POST /api/inventory-sessions`
- `GET /api/inventory-sessions/:sessionKey`
- `POST /api/inventory-sessions/:sessionKey/close`
- `GET /api/reports/session/:sessionKey/csv`

## Local Development Notes

`LOCAL_CONTEXT.md` is the local living project memory. It is ignored by git and should be updated whenever architecture, flows, schema assumptions, route responsibilities, environment variables, or development conventions change.

All project-facing text should stay in English.

## License

This project uses a custom source-available license. Free non-commercial use is allowed. Commercial use is reserved exclusively to the copyright holder. See [LICENSE](LICENSE) for the full terms.
