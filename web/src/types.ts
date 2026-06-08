export interface Location { x: number; y: number; z: number }

export type ZoneType = 'sanctuary' | 'migration' | 'patrol';
export interface Zone {
  id: string; name: string; type: ZoneType; x: number; y: number; radius: number;
}
export interface WorldBounds { minX: number; maxX: number; minY: number; maxY: number }

export type ObjectiveTier = 'authoritative' | 'heuristic' | 'manual';
export interface ObjectiveState {
  key: string; label: string; tier: ObjectiveTier;
  done: boolean; suggested: boolean; detail?: string;
}
export interface PrimeState {
  objectives: ObjectiveState[];
  completedCount: number; required: number;
  isPrimeEligible: boolean; atRisk: boolean; locked: boolean;
}
export interface PlayerSnapshot {
  id: string; name: string; location: Location; dinoClass: string;
  growth: number; health: number; stamina: number; hunger: number; thirst: number;
  prime: PrimeState;
}
export interface ServerSnapshot {
  timestamp: number;
  dataSource: 'synthetic' | 'rcon';
  worldBounds: WorldBounds;
  zones: Zone[];
  players: PlayerSnapshot[];
}

export interface Me {
  authenticated: boolean;
  name?: string;
  provider?: string;
  isAdmin?: boolean;
  playerId?: string | null;
  needsLink?: boolean;
  devAllowed?: boolean;
  discordConfigured?: boolean;
}
