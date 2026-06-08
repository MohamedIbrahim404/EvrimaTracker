# Evrima Tracker

Real-time tracker for a **The Isle: Evrima** server. Each player signs in and
sees **their own** location, health, and progress toward **Prime Elder** status.
Admins get an overview of **everyone** on a live map and synced table.

It's built so you can develop and demo it with **zero RCON/admin access** using a
synthetic data simulator, then flip to a live server by setting one env var.

## Who sees what

- **Players** sign in (Discord or dev login), link their character once by exact
  in-game name, then see only their own marker, stats, and Prime objectives.
- **Admins** (listed in `ADMIN_IDS`) see all players, the zone editor, and the
  manual/heuristic objective controls.

Snapshots are scoped per connection on the server, so a player's browser never
receives other players' data.

## How it works

Everything depends on a single `PlayerDataSource` interface with two
implementations:

- **`SyntheticDataSource`** — simulated players that move around, drift their
  stats, and path through zones. The default; use it to build and test.
- **`EvrimaRconDataSource`** — connects to a real server's RCON over the network
  (`getplayerdata`, opcode `0x77`). Works against a Physgun/Linux-hosted server
  since it only needs the RCON host/port + password — no game-host filesystem
  access.

A poller reads the data source on an interval, runs it through the Prime engine,
and pushes snapshots to the browser over WebSocket.

## Prime Elder tracking

Prime Elder = complete **at least 5 of 8** objectives before reaching 75% growth.
Evrima's RCON only exposes location/growth/health/stamina/hunger/thirst, so the 8
objectives split into three tiers:

| Tier | Objectives | How it's determined |
|------|------------|---------------------|
| **Authoritative (auto)** | Visit a Sanctuary, Visit 2 Migration Zones, Visit 4 Patrol Zones | Geometry on live location data |
| **Heuristic (auto, confirm)** | Hatch from an Egg, Raise Offspring | Inferred from growth + proximity; admin confirms |
| **Manual** | Perfect Diet, Never Infertile, Never Muscle Spasms | Not exposed by RCON — set by hand |

The engine flags players **at risk** (nearing 75% growth without 5 objectives)
and locks the result (PRIME / MISSED) at 75%.

## Running as an admin

Sign in with admin rights (dev login with **admin** ticked, or a Discord account
listed in `ADMIN_IDS`) and you get the full overview instead of a single-player
view. The header shows the data source, connection status, and live player count.

**Layout:**

- **Map (left):** every player as a marker, colored by health, positioned from
  live coordinates. Prime-eligible players get a highlight ring, at-risk players a
  warning ring. A legend explains zone colors (sanctuary / migration / patrol) and
  the eligible / at-risk markers. Click a marker to select that player.
- **Player table (left, under the map):** every player with class, coordinates,
  health, growth, Prime X/8, and an at-risk badge. Click a row to select; it stays
  in sync with the map selection.
- **Player detail (right):** the selected player's Health / Stamina / Hunger /
  Thirst, growth, and the full **Prime Elder** breakdown with a status badge
  (growing / ELIGIBLE / AT RISK / ACHIEVED / MISSED).
- **Zone editor (right):** add/edit/remove zones (see below).

**What you can do per player (in the detail panel):**

- **Authoritative objectives** show **detected / tracking** — read-only, the
  engine sets these from location geometry.
- **Heuristic objectives** (Hatch from Egg, Raise Offspring) show a **confirm**
  checkbox; movement patterns may pre-flag them as "suggested," but they only
  count toward Prime once you confirm.
- **Manual objectives** (Perfect Diet, Never Infertile, Never Muscle Spasms) are
  plain checkboxes you tick by hand.
- All controls **lock** once the player passes 75% growth (the result is final).

**Zones:** edit name / type / coordinates / radius, add or remove zones, and save.
Changes persist to `server/data/zones.json` and immediately affect auto-detection.
Sanctuaries are fixed; update migration/patrol each rotation.

**What to expect in synthetic mode:** ~8 simulated players moving around, stats
drifting, and a family pair (adult + hatchling) plus an "at-risk" player so you
can watch the heuristics, manual toggles, and at-risk/lock behavior without a real
server. In `rcon` mode the same panels show real players; also see `GET /api/diag`
for connection health and map-calibration data.

## Requirements

- Node.js 18+

## Run (development)

Two terminals:

```bash
# 1. Backend — synthetic mode, listens on :4000
cd server
npm install
npm run dev

# 2. Frontend — opens :5173, proxies /api and /ws to :4000
cd web
npm install
npm run dev
```

Open http://localhost:5173. With no Discord app configured, **dev login** is
enabled automatically: enter any name to sign in, tick **admin** for the admin
overview, or leave it unticked and link a character to test the player view.

### Map background

Drop a top-down Gateway map image at `web/public/gateway-map.jpg` to use it as
the map background. Without it the map falls back to a coordinate grid — the app
works fully either way.

### Zones

Zones (sanctuaries + rotating migration/patrol) are stored in
`server/data/zones.json` and seeded with sample defaults on first run. Sign in as
an admin and use the **Zones** editor to add/edit/remove them — sanctuaries are
fixed, migration/patrol rotate, so update those per rotation.

## Run (single process)

Build the frontend, then the backend serves it on `:4000`:

```bash
cd web && npm install && npm run build
cd ../server && npm install && npm run build && npm start
# open http://localhost:4000
```

## Going live: guide for the server admin

This section is written for **the person who has RCON access** and is testing the
app against a real Evrima server for the first time. The app was built and
verified entirely against a synthetic simulator, so the live RCON path needs one
**validate + calibrate** pass — everything is instrumented to make that quick.

### 0. Prerequisites

- **Node.js 18+** on the machine that will run the tracker. It does **not** need
  to be the game host — it connects to RCON over the network, so a laptop, VPS, or
  the Physgun box all work, as long as they can reach the RCON host/port.
- **RCON enabled on the Evrima server**, and the **RCON port + password**. On most
  hosts these live in the server config (`Game.ini` →
  `[/Script/TheIsle.TIGameSession]`, keys like `RconEnabled`, `RconPort`,
  `RconPassword`) or in the host's control panel (Physgun exposes them in the
  panel). Default RCON port assumed here is `8888` — change `RCON_PORT` if yours
  differs.

### 1. Validate the RCON connection in isolation (do this first)

Before running the whole app, confirm the protocol works with the bundled probe.
It uses the exact same RCON code as the server but just connects once, dumps the
raw response, prints what it parsed, and exits:

```bash
cd server
cp .env.example .env
# edit .env: set RCON_HOST, RCON_PORT, RCON_PASSWORD
npm install
npm run rcon:probe
```

Make sure at least one player is **online in-game** when you run it. Expected
outcomes:

- **`✓ RCON works and the parser understood the response`** + a JSON list of
  players → great, the protocol and parser match. Note the X/Y ranges for step 3.
- **Connection error** → RCON isn't reachable. Check it's enabled, the host/port
  are right and reachable (firewall), and the password is correct.
- **`⚠ No players were parsed`** but the raw dump above shows player data → the
  response *format* differs from the parser. See step 4.

### 2. Run the app against the live server

```bash
# build the web UI once, then run the server (serves UI + API on :4000)
cd web && npm install && npm run build
cd ../server && npm run build
# in server/.env set: DATA_SOURCE=rcon   (RCON_* already set from step 1)
npm start
# open http://localhost:4000
```

Sign in: since Discord isn't configured, **dev login** is on — enter any name,
tick **admin**, and you'll land on the full overview. The server won't crash if
RCON drops; it logs and keeps retrying.

### 3. Calibrate the map

As an admin, open **`http://localhost:4000/api/diag`**. It reports connection
status, last poll, player count, and **`observedCoords`** — the real X/Y range of
players seen so far. Put those into `.env` as `WORLD_MIN_X/MAX_X/MIN_Y/MAX_Y` and
restart, so markers land in the right place. Drop a top-down Gateway map image at
`web/public/gateway-map.jpg` (rebuild web) to replace the grid background.

### 4. If the parser needs adjusting

The RCON adapter mirrors Evrima's binary protocol (auth `0x01`, exec `0x02`,
`getplayerdata` `0x77`), but the exact text layout of the response can vary by
server build — this is the one thing that couldn't be verified without a live
server (marked `TODO(validate-live)`). If players don't parse:

1. Run `npm run rcon:probe` (or set `RCON_DEBUG=1` and watch the server log) to
   see the raw response.
2. Edit `parsePlayerData()` in `server/src/datasource/EvrimaRconDataSource.ts` so
   the field patterns match what you see, then `npm run build` and re-probe.
3. Reference implementations to compare the format against:
   `smultar-dev/evrima.rcon` (TypeScript) and `butt4cak3/theislercon` (Go).

### 5. Open it up to players (after the test passes)

For real player use, set up Discord login and lock down admin:

- Create a Discord app (https://discord.com/developers), set
  `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`, and set its OAuth redirect to
  `<your-public-url>/auth/discord/callback`.
- List admin Discord user IDs in `ADMIN_IDS`. Leave `AUTH_DEV` unset.
- Players sign in with Discord, then **claim their character** by exact in-game
  name (they must be online so the server can match them). Each player then sees
  only their own data; admins see everyone.

Zones are managed in-app by admins (stored in `server/data/zones.json`) — set them
up via the **Zones** editor after signing in. Sanctuaries are fixed;
migration/patrol rotate, so update those each rotation.

### Security notes

- **Dev login** is for testing. While Discord is unconfigured, anyone reaching the
  app can sign in (and tick admin). Once `DISCORD_CLIENT_ID`/`SECRET` are set, dev
  login can only grant admin to IDs in `ADMIN_IDS`, so a stray `AUTH_DEV=1` can't
  hand out admin. Don't expose the app publicly in dev-login mode.
- **Character claim** matches by exact in-game name with no further proof, so a
  player could claim a name that isn't theirs if they know it's online. Fine for a
  trusted group / testing; revisit if you need stronger identity.
- Behind an HTTPS reverse proxy the session cookie is automatically marked
  `Secure` (detected via `x-forwarded-proto`).

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `DATA_SOURCE` | `synthetic` | `synthetic` or `rcon` |
| `PORT` | `4000` | HTTP + WebSocket port |
| `POLL_INTERVAL_MS` | `3000` | How often to poll the data source |
| `RCON_HOST` | — | Required when `DATA_SOURCE=rcon` |
| `RCON_PORT` | `8888` | RCON port |
| `RCON_PASSWORD` | — | Required when `DATA_SOURCE=rcon` |
| `RCON_DEBUG` | `0` | `1` dumps the raw `getplayerdata` response each poll |
| `WORLD_MIN_X` / `MAX_X` / `MIN_Y` / `MAX_Y` | `±100000` | Map calibration bounds; derive from `/api/diag` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | — | Enable Discord login (disables dev login when set) |
| `DISCORD_REDIRECT_URI` | auto | Override OAuth callback URL if behind a proxy |
| `ADMIN_IDS` | — | Comma-separated admin IDs (`<id>` or `<provider>:<id>`) |
| `AUTH_DEV` | `1` if no Discord | Set `1` to force-enable dev login |

Config can be set via a `.env` file in `server/` (see `.env.example`) or as real
environment variables. An admin-only `GET /api/diag` reports live connection
status and observed coordinates for debugging/calibration.

## Project layout

```
evrima-tracker/
  server/   Node + TypeScript backend
    src/
      datasource/   PlayerDataSource interface + synthetic & RCON impls
      prime/        Prime Elder engine
      auth.ts       sessions, Discord/dev login, identity→player linking
      zones.ts      file-backed ZoneStore (admin-editable)
      server.ts     poller, WebSocket (scoped), auth + admin REST, static serving
      types.ts      shared domain types
    data/         links.json + zones.json (created at runtime)
  web/      React + TypeScript frontend
    public/       gateway-map.jpg (optional map background)
    src/
      App.tsx              auth bootstrap + role routing
      Login.tsx            Discord + dev login
      ClaimCharacter.tsx   link in-game name to account
      PlayerView.tsx       per-player scoped view
      MapView.tsx, PlayerTable.tsx, AdminPanel.tsx, ZoneEditor.tsx
      api.ts, useLiveData.ts
```
