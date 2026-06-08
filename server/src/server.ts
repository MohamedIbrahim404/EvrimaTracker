import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

import type { PlayerDataSource } from './datasource/PlayerDataSource.js';
import { SyntheticDataSource } from './datasource/SyntheticDataSource.js';
import { EvrimaRconDataSource } from './datasource/EvrimaRconDataSource.js';
import { PrimeEngine } from './prime/primeEngine.js';
import { ZoneStore } from './zones.js';
import {
  authRouter,
  requireAdmin,
  getSession,
  getSessionFromCookieHeader,
  getLink,
  authConfig,
  type Session,
} from './auth.js';
import type { ServerSnapshot, ObjectiveKey, Player, Zone, WorldBounds } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 4000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 3000);
const DATA_SOURCE = (process.env.DATA_SOURCE ?? 'synthetic') as 'synthetic' | 'rcon';

// World bounds for projecting x/y onto the map. Override per real server via env;
// derive the right values from the observed coord ranges in GET /api/diag.
function envWorldBounds(): WorldBounds {
  const n = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
  return {
    minX: n(process.env.WORLD_MIN_X, -100000),
    maxX: n(process.env.WORLD_MAX_X, 100000),
    minY: n(process.env.WORLD_MIN_Y, -100000),
    maxY: n(process.env.WORLD_MAX_Y, 100000),
  };
}

const zoneStore = new ZoneStore();

function buildDataSource(): PlayerDataSource {
  if (DATA_SOURCE === 'rcon') {
    const host = process.env.RCON_HOST;
    const password = process.env.RCON_PASSWORD;
    if (!host || !password) {
      throw new Error('DATA_SOURCE=rcon requires RCON_HOST and RCON_PASSWORD env vars');
    }
    return new EvrimaRconDataSource({
      host,
      port: Number(process.env.RCON_PORT ?? 8888),
      password,
      worldBounds: envWorldBounds(),
    });
  }
  return new SyntheticDataSource(() => zoneStore.all());
}

// Build the view a given session is allowed to see.
function scopeSnapshot(full: ServerSnapshot, session: Session | null): ServerSnapshot {
  if (session?.isAdmin) return full; // admins see everyone
  const playerId = session ? getLink(session.userId) : null;
  const players = playerId ? full.players.filter((p) => p.id === playerId) : [];
  return { ...full, players };
}

async function main() {
  const ds = buildDataSource();
  const prime = new PrimeEngine();
  // Best-effort initial connect; the poll loop reconnects on failure, so a
  // transient RCON outage at boot must not kill the server.
  await ds.connect?.().catch((e) => console.warn('initial connect failed, will retry:', (e as Error).message));

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  let latest: ServerSnapshot | null = null;
  let latestPlayers: Player[] = [];
  let lastPollAt: number | null = null;
  let lastPollError: string | null = null;
  // Observed coordinate ranges across all polled players — used to calibrate
  // WORLD_* env vars against a real server.
  const observed = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, seen: false };
  function observe(players: Player[]) {
    for (const p of players) {
      observed.minX = Math.min(observed.minX, p.location.x);
      observed.maxX = Math.max(observed.maxX, p.location.x);
      observed.minY = Math.min(observed.minY, p.location.y);
      observed.maxY = Math.max(observed.maxY, p.location.y);
    }
    if (players.length && !observed.seen) {
      observed.seen = true;
      console.log(
        `[diag] first player coords observed — X[${observed.minX}..${observed.maxX}] ` +
          `Y[${observed.minY}..${observed.maxY}] (calibrate WORLD_* from GET /api/diag)`,
      );
    }
  }

  app.use('/auth', authRouter({ getPlayers: () => latestPlayers }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    (ws as any).cookieHeader = req.headers.cookie;
    if (latest) {
      const session = getSessionFromCookieHeader(req.headers.cookie);
      ws.send(JSON.stringify({ type: 'snapshot', data: scopeSnapshot(latest, session) }));
    }
  });

  function broadcast() {
    if (!latest) return;
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const session = getSessionFromCookieHeader((client as any).cookieHeader);
      const msg = JSON.stringify({ type: 'snapshot', data: scopeSnapshot(latest, session) });
      client.send(msg);
    }
  }

  // ---- Snapshot (scoped to caller) ----
  app.get('/api/snapshot', (req, res) => {
    if (!latest) return void res.json({ error: 'no data yet' });
    res.json(scopeSnapshot(latest, getSession(req)));
  });

  // ---- Zones: read open, mutations admin-only ----
  app.get('/api/zones', (_req, res) => res.json(zoneStore.all()));
  app.put('/api/zones', requireAdmin, (req, res) => {
    res.json(zoneStore.replaceAll((req.body as Zone[]) ?? []));
  });
  app.post('/api/zones', requireAdmin, (req, res) => {
    res.json(zoneStore.upsert(req.body as Zone));
  });
  app.delete('/api/zones/:id', requireAdmin, (req, res) => {
    zoneStore.remove(req.params.id);
    res.json({ ok: true });
  });

  // ---- Admin: Prime objective overrides ----
  app.post('/api/admin/objective', requireAdmin, (req, res) => {
    const { playerId, key, value } = req.body as { playerId: string; key: ObjectiveKey; value: boolean };
    res.status(prime.setManual(playerId, key, Boolean(value)) ? 200 : 400).json({ ok: true });
  });
  app.post('/api/admin/confirm', requireAdmin, (req, res) => {
    const { playerId, key, value } = req.body as { playerId: string; key: ObjectiveKey; value: boolean };
    res.status(prime.confirmHeuristic(playerId, key, Boolean(value)) ? 200 : 400).json({ ok: true });
  });

  // ---- Admin diagnostics (live RCON debugging + map calibration) ----
  app.get('/api/diag', requireAdmin, (_req, res) => {
    res.json({
      dataSource: ds.kind,
      pollIntervalMs: POLL_INTERVAL_MS,
      lastPollAt,
      lastPollError,
      playerCount: latestPlayers.length,
      worldBounds: ds.getWorldBounds(),
      observedCoords: observed.seen
        ? { minX: observed.minX, maxX: observed.maxX, minY: observed.minY, maxY: observed.maxY }
        : null,
      source: ds.status?.() ?? null,
      auth: authConfig(),
    });
  });

  // ---- Serve built frontend if present ----
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  // ---- Poll loop ----
  let lastPoll = Date.now();
  async function poll() {
    try {
      const players = await ds.getPlayerData();
      const zones = zoneStore.all();
      const now = Date.now();
      const dtMs = now - lastPoll;
      lastPoll = now;

      prime.update(players, zones, dtMs);
      prime.prune(new Set(players.map((p) => p.id)));
      observe(players);
      lastPollAt = now;
      lastPollError = null;

      latestPlayers = players;
      latest = {
        timestamp: now,
        dataSource: ds.kind,
        worldBounds: ds.getWorldBounds(),
        zones,
        players: players.map((p) => ({ ...p, prime: prime.getState(p) })),
      };
      broadcast();
    } catch (e) {
      lastPollError = (e as Error).message;
      console.error('poll error:', lastPollError);
    }
  }

  const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  await poll();

  // ---- Graceful shutdown ----
  let shuttingDown = false;
  async function shutdown(sig: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${sig} received, shutting down…`);
    clearInterval(pollTimer);
    await ds.disconnect?.().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  server.listen(PORT, () => {
    const { discordConfigured, devAllowed } = authConfig();
    console.log(`Evrima tracker server on :${PORT} (data source: ${ds.kind})`);
    console.log(`  auth: discord=${discordConfigured} devLogin=${devAllowed}`);
    if (!fs.existsSync(webDist)) {
      console.log('  (web not built yet — run the web dev server separately)');
    }
  });
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
