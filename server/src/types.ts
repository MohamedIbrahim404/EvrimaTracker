// Shared domain types for the Evrima tracker.
// Player mirrors the struct returned by Evrima RCON `getplayerdata` (0x77).

export interface Location {
  x: number;
  y: number;
  z: number;
}

export interface Player {
  id: string; // Steam or EOS id
  name: string;
  location: Location;
  dinoClass: string;
  growth: number; // 0-100 (%). 75 = fully grown / Prime deadline.
  health: number; // 0-100 (%)
  stamina: number; // 0-100 (%)
  hunger: number; // 0-100 (%)
  thirst: number; // 0-100 (%)
}

export type ZoneType = 'sanctuary' | 'migration' | 'patrol';

// Zones approximated as circles (center + radius) in world units.
export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  radius: number;
}

// World coordinate bounds, used to project x/y onto the map image.
export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// The 8 Prime Elder objectives, grouped by how we determine completion.
export type ObjectiveKey =
  // Tier 1 — authoritative auto (geometry on location data)
  | 'visitSanctuary'
  | 'visitMigrationZones'
  | 'visitPatrolZones'
  // Tier 2 — heuristic auto (inference, admin-confirmable)
  | 'hatchedFromEgg'
  | 'raisedOffspring'
  // Tier 3 — manual (signal not exposed by RCON)
  | 'perfectDiet'
  | 'neverInfertile'
  | 'neverMuscleSpasms';

export type ObjectiveTier = 'authoritative' | 'heuristic' | 'manual';

export interface ObjectiveState {
  key: ObjectiveKey;
  label: string;
  tier: ObjectiveTier;
  done: boolean;
  // For heuristic objectives: the engine suggests true but waits for admin confirm.
  suggested: boolean;
  detail?: string; // e.g. "3/4 patrol zones"
}

export interface PrimeState {
  objectives: ObjectiveState[];
  completedCount: number;
  required: number; // 5
  isPrimeEligible: boolean;
  atRisk: boolean; // nearing 75% growth without enough objectives
  locked: boolean; // growth >= 75, result final
}

// What the server pushes to clients each tick.
export interface PlayerSnapshot extends Player {
  prime: PrimeState;
}

export interface ServerSnapshot {
  timestamp: number;
  dataSource: 'synthetic' | 'rcon';
  worldBounds: WorldBounds;
  zones: Zone[];
  players: PlayerSnapshot[];
}
