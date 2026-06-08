import type {
  Player,
  Zone,
  PrimeState,
  ObjectiveKey,
  ObjectiveState,
  ObjectiveTier,
} from '../types.js';

const REQUIRED = 5; // need 5 of 8
const PRIME_DEADLINE_GROWTH = 75; // objectives must be earned before this
const AT_RISK_GROWTH = 65;
const SANCTUARY_DWELL_MS = 10_000;
const SUB_ADULT_GROWTH = 50;
const HATCHLING_GROWTH = 6; // first-sighting growth that looks "just hatched"
const FAMILY_PROXIMITY = 8_000; // world units between baby and parent
const NEW_LIFE_DROP = 15; // growth dropping this much ⇒ new life, reset track

interface ObjectiveMeta {
  key: ObjectiveKey;
  label: string;
  tier: ObjectiveTier;
}

const OBJECTIVES: ObjectiveMeta[] = [
  { key: 'visitSanctuary', label: 'Visit a Sanctuary', tier: 'authoritative' },
  { key: 'visitMigrationZones', label: 'Visit 2 Migration Zones', tier: 'authoritative' },
  { key: 'visitPatrolZones', label: 'Visit 4 Patrol Zones', tier: 'authoritative' },
  { key: 'hatchedFromEgg', label: 'Hatch from an Egg', tier: 'heuristic' },
  { key: 'raisedOffspring', label: 'Raise Offspring', tier: 'heuristic' },
  { key: 'perfectDiet', label: 'Perfect Diet', tier: 'manual' },
  { key: 'neverInfertile', label: 'Never Infertile', tier: 'manual' },
  { key: 'neverMuscleSpasms', label: 'Never Muscle Spasms', tier: 'manual' },
];

interface Track {
  seen: boolean;
  firstGrowth: number;
  lastGrowth: number;
  // Tier 1 progress
  sanctuaryDwellMs: number;
  migrationVisited: Set<string>;
  patrolVisited: Set<string>;
  // Tier 2 heuristics
  parentId?: string; // set on a baby: who it hatched next to
  hatchedSuggested: boolean;
  raisedSuggested: boolean; // set on the PARENT when its baby reaches sub-adult
  confirmed: Record<'hatchedFromEgg' | 'raisedOffspring', boolean>;
  // Tier 3 manual
  manual: Record<'perfectDiet' | 'neverInfertile' | 'neverMuscleSpasms', boolean>;
  // Frozen result once growth >= 75
  locked: boolean;
}

function newTrack(growth: number): Track {
  return {
    seen: true,
    firstGrowth: growth,
    lastGrowth: growth,
    sanctuaryDwellMs: 0,
    migrationVisited: new Set(),
    patrolVisited: new Set(),
    hatchedSuggested: false,
    raisedSuggested: false,
    confirmed: { hatchedFromEgg: false, raisedOffspring: false },
    manual: { perfectDiet: false, neverInfertile: false, neverMuscleSpasms: false },
    locked: false,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class PrimeEngine {
  private tracks = new Map<string, Track>();

  /** Advance all per-player objective state from a fresh snapshot. */
  update(players: Player[], zones: Zone[], dtMs: number): void {
    const byId = new Map(players.map((p) => [p.id, p]));

    for (const p of players) {
      let t = this.tracks.get(p.id);

      // New player, or a new life (growth dropped sharply ⇒ respawn).
      if (!t || p.growth < t.lastGrowth - NEW_LIFE_DROP) {
        t = newTrack(p.growth);
        this.tracks.set(p.id, t);
        this.detectHatch(p, players);
      }
      t.lastGrowth = p.growth;

      if (t.locked) continue; // result final, stop accumulating
      if (p.growth >= PRIME_DEADLINE_GROWTH) {
        t.locked = true;
        continue;
      }

      this.detectZones(p, zones, t, dtMs);
      this.detectRaised(p, t, byId);
    }
  }

  private detectHatch(baby: Player, players: Player[]): void {
    const t = this.tracks.get(baby.id);
    if (!t) return;
    if (baby.growth > HATCHLING_GROWTH) return; // not freshly hatched

    // Look for a same-species companion nearby ⇒ likely nested by a parent.
    const parent = players.find(
      (o) =>
        o.id !== baby.id &&
        o.dinoClass === baby.dinoClass &&
        dist(o.location, baby.location) <= FAMILY_PROXIMITY,
    );
    if (parent) {
      t.parentId = parent.id;
      t.hatchedSuggested = true;
    }
  }

  private detectZones(p: Player, zones: Zone[], t: Track, dtMs: number): void {
    let inSanctuary = false;
    for (const z of zones) {
      if (dist(p.location, z) > z.radius) continue;
      if (z.type === 'sanctuary') inSanctuary = true;
      else if (z.type === 'migration') t.migrationVisited.add(z.id);
      else if (z.type === 'patrol') t.patrolVisited.add(z.id);
    }
    if (inSanctuary) t.sanctuaryDwellMs += dtMs;
  }

  private detectRaised(child: Player, childTrack: Track, byId: Map<string, Player>): void {
    if (!childTrack.parentId) return;
    if (child.growth < SUB_ADULT_GROWTH) return;
    const parent = byId.get(childTrack.parentId);
    if (!parent) return;
    if (dist(child.location, parent.location) > FAMILY_PROXIMITY) return;
    const parentTrack = this.tracks.get(parent.id);
    if (parentTrack && !parentTrack.locked) parentTrack.raisedSuggested = true;
  }

  // ---- Admin actions ----

  setManual(playerId: string, key: ObjectiveKey, value: boolean): boolean {
    const t = this.tracks.get(playerId);
    if (!t || t.locked) return false;
    if (key === 'perfectDiet' || key === 'neverInfertile' || key === 'neverMuscleSpasms') {
      t.manual[key] = value;
      return true;
    }
    return false;
  }

  confirmHeuristic(playerId: string, key: ObjectiveKey, value: boolean): boolean {
    const t = this.tracks.get(playerId);
    if (!t || t.locked) return false;
    if (key === 'hatchedFromEgg' || key === 'raisedOffspring') {
      t.confirmed[key] = value;
      return true;
    }
    return false;
  }

  /** Build the client-facing Prime state for a player. */
  getState(p: Player): PrimeState {
    const t = this.tracks.get(p.id) ?? newTrack(p.growth);

    const done: Record<ObjectiveKey, boolean> = {
      visitSanctuary: t.sanctuaryDwellMs >= SANCTUARY_DWELL_MS,
      visitMigrationZones: t.migrationVisited.size >= 2,
      visitPatrolZones: t.patrolVisited.size >= 4,
      // Heuristics count only once an admin confirms them.
      hatchedFromEgg: t.confirmed.hatchedFromEgg,
      raisedOffspring: t.confirmed.raisedOffspring,
      perfectDiet: t.manual.perfectDiet,
      neverInfertile: t.manual.neverInfertile,
      neverMuscleSpasms: t.manual.neverMuscleSpasms,
    };

    const suggested: Partial<Record<ObjectiveKey, boolean>> = {
      hatchedFromEgg: t.hatchedSuggested,
      raisedOffspring: t.raisedSuggested,
    };

    const detail: Partial<Record<ObjectiveKey, string>> = {
      visitSanctuary: `${Math.min(100, Math.round((t.sanctuaryDwellMs / SANCTUARY_DWELL_MS) * 100))}% dwell`,
      visitMigrationZones: `${t.migrationVisited.size}/2 zones`,
      visitPatrolZones: `${t.patrolVisited.size}/4 zones`,
    };

    const objectives: ObjectiveState[] = OBJECTIVES.map((m) => ({
      key: m.key,
      label: m.label,
      tier: m.tier,
      done: done[m.key],
      suggested: suggested[m.key] ?? false,
      detail: detail[m.key],
    }));

    const completedCount = objectives.filter((o) => o.done).length;
    const isPrimeEligible = completedCount >= REQUIRED;
    const locked = t.locked || p.growth >= PRIME_DEADLINE_GROWTH;

    return {
      objectives,
      completedCount,
      required: REQUIRED,
      isPrimeEligible,
      atRisk: !isPrimeEligible && !locked && p.growth >= AT_RISK_GROWTH,
      locked,
    };
  }

  /** Drop tracks for players no longer present. */
  prune(activeIds: Set<string>): void {
    for (const id of this.tracks.keys()) {
      if (!activeIds.has(id)) this.tracks.delete(id);
    }
  }
}
