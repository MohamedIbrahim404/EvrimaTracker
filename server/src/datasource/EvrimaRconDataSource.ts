import net from 'node:net';
import type { Player, WorldBounds, Location } from '../types.js';
import type { PlayerDataSource, DataSourceStatus } from './PlayerDataSource.js';

const DEBUG = process.env.RCON_DEBUG === '1';

// ============================================================================
// REAL RCON ADAPTER — NEEDS VALIDATION AGAINST A LIVE EVRIMA SERVER.
// ----------------------------------------------------------------------------
// The tracker runs OFF the game host and connects over the network, so this
// works fine for a Physgun-hosted (Linux) server: it only needs the RCON
// host/port reachable and the RCON password. No filesystem access required.
//
// Evrima uses a custom binary protocol (NOT standard Source RCON):
//   auth:    0x01 + <password> + 0x00
//   command: 0x02 + <opcode> + <params> + 0x00
//   getplayerdata opcode: 0x77
// The getplayerdata response is a text blob; the exact field layout must be
// confirmed against a real server (see parsePlayerData TODO).
// ============================================================================

const RCON_AUTH = 0x01;
const RCON_EXEC = 0x02;
const OP_GETPLAYERDATA = 0x77;

export interface RconConfig {
  host: string;
  port: number;
  password: string;
  // World bounds for the live map. Tune to the real Gateway map coordinates.
  worldBounds: WorldBounds;
}

function packet(type: number, payload: string | Buffer = ''): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  return Buffer.concat([Buffer.from([type]), body, Buffer.from([0x00])]);
}

const tag = '[rcon]';

export class EvrimaRconDataSource implements PlayerDataSource {
  readonly kind = 'rcon' as const;
  private socket: net.Socket | null = null;
  private authed = false;
  private lastError: string | null = null;
  private lastRawBytes: number | null = null;

  constructor(private cfg: RconConfig) {}

  getWorldBounds(): WorldBounds {
    return this.cfg.worldBounds;
  }

  status(): DataSourceStatus {
    return {
      connected: Boolean(this.socket) && !this.socket!.destroyed,
      authed: this.authed,
      lastError: this.lastError,
      lastRawBytes: this.lastRawBytes,
    };
  }

  // Drop the current socket so the next poll reconnects cleanly.
  private reset(why: string): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }
    this.socket = null;
    this.authed = false;
    console.warn(`${tag} connection reset: ${why}`);
  }

  async connect(): Promise<void> {
    if (this.socket && this.authed) return;
    console.log(`${tag} connecting to ${this.cfg.host}:${this.cfg.port}…`);
    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection({ host: this.cfg.host, port: this.cfg.port }, () => {
        console.log(`${tag} tcp connected, authenticating…`);
        sock.write(packet(RCON_AUTH, this.cfg.password));
      });
      sock.setTimeout(10_000);
      const onData = (_buf: Buffer) => {
        // First server reply after auth indicates success. Real protocol detail
        // to confirm: some servers send an explicit auth ack byte.
        this.authed = true;
        this.lastError = null;
        sock.off('data', onData);
        sock.setTimeout(0);
        console.log(`${tag} authenticated`);
        resolve();
      };
      sock.on('data', onData);
      sock.on('error', (e) => {
        this.lastError = e.message;
        reject(e);
      });
      sock.on('timeout', () => reject(new Error('RCON connect timeout')));
      // Once connected, a later close/error should force a reconnect, not a hang.
      sock.on('close', () => { if (this.socket === sock) this.reset('socket closed'); });
      this.socket = sock;
    }).catch((e) => {
      this.reset((e as Error).message);
      throw e;
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }
    this.socket = null;
    this.authed = false;
  }

  private async exec(opcode: number, params = ''): Promise<string> {
    if (!this.socket || !this.authed) await this.connect();
    const sock = this.socket!;
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const done = () => {
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      };
      // Evrima sends the whole response in one or more chunks then goes quiet;
      // settle shortly after the last chunk.
      let settle: NodeJS.Timeout;
      const onData = (b: Buffer) => {
        chunks.push(b);
        clearTimeout(settle);
        settle = setTimeout(done, 250);
      };
      const onErr = (e: Error) => {
        cleanup();
        this.lastError = e.message;
        this.reset(e.message);
        reject(e);
      };
      const cleanup = () => {
        clearTimeout(settle);
        sock.off('data', onData);
        sock.off('error', onErr);
      };
      sock.on('data', onData);
      sock.on('error', onErr);
      sock.write(packet(RCON_EXEC, Buffer.concat([Buffer.from([opcode]), Buffer.from(params, 'utf8')])));
      settle = setTimeout(done, 3_000); // overall safety timeout
    });
  }

  async getPlayerData(): Promise<Player[]> {
    const raw = await this.exec(OP_GETPLAYERDATA);
    this.lastRawBytes = Buffer.byteLength(raw, 'utf8');

    if (DEBUG) {
      const hex = Buffer.from(raw, 'utf8').subarray(0, 256).toString('hex');
      console.log(`${tag} getplayerdata raw (${this.lastRawBytes} bytes):`);
      console.log(`${tag}   hex[0:256]: ${hex}`);
      console.log(`${tag}   utf8: ${JSON.stringify(raw.slice(0, 2000))}`);
    }

    const players = parsePlayerData(raw);
    if (raw.trim() && players.length === 0) {
      console.warn(
        `${tag} parsed 0 players from ${this.lastRawBytes} bytes — the response ` +
          `layout likely differs from the parser. Set RCON_DEBUG=1 to dump the raw ` +
          `response and adjust parsePlayerData() in EvrimaRconDataSource.ts.`,
      );
    }
    return players;
  }
}

// TODO(validate-live): confirm the exact getplayerdata text layout against a
// real server and tighten this parser. Current version is tolerant: it splits
// on "PlayerDataName"/"Name" record boundaries and regex-extracts known fields.
export function parsePlayerData(raw: string): Player[] {
  const players: Player[] = [];
  if (!raw.trim()) return players;

  // Split into per-player records. Real delimiters vary by server build.
  const records = raw.split(/(?=(?:PlayerDataName|PlayerID|Name)\s*[:=])/i).filter((r) => r.trim());

  for (const rec of records) {
    const name = match(rec, /(?:PlayerDataName|Name)\s*[:=]\s*([^\n,]+)/i);
    const id = match(rec, /(?:PlayerID|EOSID|SteamID|ID)\s*[:=]\s*([A-Za-z0-9]+)/i);
    if (!name && !id) continue;

    const loc = parseLocation(rec);
    players.push({
      id: id ?? name ?? 'unknown',
      name: name ?? id ?? 'unknown',
      location: loc,
      dinoClass: cleanClass(match(rec, /(?:Class|Dino|Character)\s*[:=]\s*([^\n,]+)/i) ?? 'Unknown'),
      growth: normGrowth(num(rec, /Growth\s*[:=]\s*([\d.]+)/i)),
      health: normStat(num(rec, /Health\s*[:=]\s*([\d.]+)/i)),
      stamina: normStat(num(rec, /Stamina\s*[:=]\s*([\d.]+)/i)),
      hunger: normStat(num(rec, /Hunger\s*[:=]\s*([\d.]+)/i)),
      thirst: normStat(num(rec, /Thirst\s*[:=]\s*([\d.]+)/i)),
    });
  }
  return players;
}

function parseLocation(rec: string): Location {
  const x = num(rec, /X\s*[:=]\s*(-?[\d.]+)/i) ?? 0;
  const y = num(rec, /Y\s*[:=]\s*(-?[\d.]+)/i) ?? 0;
  const z = num(rec, /Z\s*[:=]\s*(-?[\d.]+)/i) ?? 0;
  return { x, y, z };
}

function match(s: string, re: RegExp): string | undefined {
  return s.match(re)?.[1]?.trim();
}
function num(s: string, re: RegExp): number | undefined {
  const m = s.match(re)?.[1];
  return m === undefined ? undefined : Number(m);
}
function cleanClass(c: string): string {
  return c.replace(/^BP_/, '').replace(/_C$/, '').trim();
}
// Growth comes as 0..1 on some builds, 0..100 on others.
function normGrowth(v: number | undefined): number {
  if (v === undefined) return 0;
  return Math.round(v <= 1 ? v * 100 : v);
}
function normStat(v: number | undefined): number {
  if (v === undefined) return 0;
  return Math.round(v <= 1 ? v * 100 : v);
}
