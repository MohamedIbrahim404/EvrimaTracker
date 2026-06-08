import type { Player, WorldBounds } from '../types.js';

// Connection/health snapshot for diagnostics (live RCON debugging).
export interface DataSourceStatus {
  connected: boolean;
  authed: boolean;
  lastError: string | null;
  lastRawBytes: number | null;
}

// The single seam everything depends on. Swap implementations (synthetic vs
// real RCON) without touching the poller, prime engine, or transport.
// Zones are owned by the ZoneStore, not the data source.
export interface PlayerDataSource {
  readonly kind: 'synthetic' | 'rcon';

  // World coordinate bounds for projecting x/y onto the map image.
  getWorldBounds(): WorldBounds;

  // Current players. Mirrors RCON getplayerdata. Poll-based.
  getPlayerData(): Promise<Player[]>;

  // Optional lifecycle hooks for connection-based sources.
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  // Optional health snapshot for the admin diagnostics endpoint.
  status?(): DataSourceStatus;
}
