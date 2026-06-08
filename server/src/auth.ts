import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Router } from 'express';
import type { Player } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');

export interface Session {
  id: string;
  userId: string; // stable id from the provider (e.g. discord:123, dev:Name)
  provider: 'dev' | 'discord' | 'steam';
  name: string;
  isAdmin: boolean;
}

// ---- in-memory sessions (opaque cookie id -> session) ----
const sessions = new Map<string, Session>();

// ---- file-backed identity -> in-game player id links ----
let links: Record<string, string> = loadLinks();

function loadLinks(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveLinks(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}
export function getLink(userId: string): string | null {
  return links[userId] ?? null;
}
function setLink(userId: string, playerId: string): void {
  links[userId] = playerId;
  saveLinks();
}

// ---- cookie helpers ----
function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttps(req: Request): boolean {
  return req.secure || (req.headers['x-forwarded-proto'] as string)?.split(',')[0] === 'https';
}
function setSidCookie(req: Request, res: Response, id: string): void {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`);
}

export function getSessionFromCookieHeader(header?: string): Session | null {
  const sid = parseCookies(header).sid;
  return sid ? sessions.get(sid) ?? null : null;
}
export function getSession(req: Request): Session | null {
  return getSessionFromCookieHeader(req.headers.cookie);
}

function createSession(s: Omit<Session, 'id'>): Session {
  const id = crypto.randomUUID();
  const session: Session = { ...s, id };
  sessions.set(id, session);
  return session;
}

// ---- admin allowlist ----
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
function isAdminUser(provider: string, providerId: string): boolean {
  return ADMIN_IDS.includes(providerId) || ADMIN_IDS.includes(`${provider}:${providerId}`);
}

// ---- config ----
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const discordConfigured = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
// Dev login is allowed unless explicitly disabled, or whenever Discord isn't set up.
const devAllowed = process.env.AUTH_DEV === '1' || !discordConfigured;

export function authConfig() {
  return { discordConfigured, devAllowed, adminCount: ADMIN_IDS.length };
}

export const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const s = getSession(req);
  if (!s || !s.isAdmin) {
    res.status(403).json({ error: 'admin only' });
    return;
  }
  next();
};

// ---- router ----
export function authRouter(deps: { getPlayers: () => Player[] }): Router {
  const r = Router();

  r.get('/me', (req, res) => {
    const s = getSession(req);
    if (!s) {
      res.json({ authenticated: false, devAllowed, discordConfigured });
      return;
    }
    const playerId = s.isAdmin ? null : getLink(s.userId);
    res.json({
      authenticated: true,
      name: s.name,
      provider: s.provider,
      isAdmin: s.isAdmin,
      playerId,
      needsLink: !s.isAdmin && !playerId,
    });
  });

  // Claim your in-game character by exact name (matches a current player).
  r.post('/link', (req, res) => {
    const s = getSession(req);
    if (!s) return void res.status(401).json({ error: 'not logged in' });
    const name = String(req.body?.playerName ?? '').trim();
    if (!name) return void res.status(400).json({ error: 'playerName required' });
    const match = deps.getPlayers().find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!match) return void res.status(404).json({ error: 'no online player with that name' });
    setLink(s.userId, match.id);
    res.json({ ok: true, playerId: match.id });
  });

  r.post('/logout', (req, res) => {
    const s = getSession(req);
    if (s) sessions.delete(s.id);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  // ---- dev login (iteration without real OAuth) ----
  if (devAllowed) {
    r.get('/dev', (req, res) => {
      const name = String(req.query.as ?? 'DevPlayer');
      // Dev login may grant admin only in pure-local dev (no Discord configured)
      // or when this dev id is explicitly allow-listed. This way a stray
      // AUTH_DEV=1 in a real deployment can't mint admins.
      const wantsAdmin = req.query.admin === '1';
      const admin = wantsAdmin && (!discordConfigured || isAdminUser('dev', name));
      const s = createSession({ userId: `dev:${name}`, provider: 'dev', name, isAdmin: admin });
      setSidCookie(req, res, s.id);
      res.json({ ok: true, name, isAdmin: admin });
    });
  }

  // ---- Discord OAuth ----
  if (discordConfigured) {
    r.get('/discord', (req, res) => {
      const redirectUri = redirectUriFor(req);
      const url =
        `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
      res.redirect(url);
    });

    r.get('/discord/callback', async (req, res) => {
      try {
        const code = String(req.query.code ?? '');
        if (!code) throw new Error('missing code');
        const redirectUri = redirectUriFor(req);
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID!,
            client_secret: DISCORD_CLIENT_SECRET!,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });
        const token = (await tokenRes.json()) as { access_token?: string };
        if (!token.access_token) throw new Error('token exchange failed');
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        const u = (await userRes.json()) as { id: string; username: string; global_name?: string };
        const s = createSession({
          userId: `discord:${u.id}`,
          provider: 'discord',
          name: u.global_name || u.username,
          isAdmin: isAdminUser('discord', u.id),
        });
        setSidCookie(req, res, s.id);
        res.redirect('/');
      } catch (e) {
        res.status(500).send(`Discord login failed: ${(e as Error).message}`);
      }
    });
  }

  return r;
}

function redirectUriFor(req: Request): string {
  if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.headers.host}/auth/discord/callback`;
}
