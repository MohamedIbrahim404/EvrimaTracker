import type { Player, Zone, WorldBounds, Location } from '../types.js';
import type { PlayerDataSource } from './PlayerDataSource.js';

const WORLD: WorldBounds = { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 };

const SPECIES = ['Tenontosaurus', 'Stegosaurus', 'Carnotaurus', 'Allosaurus', 'Deinosuchus', 'Pteranodon'];

interface SimPlayer extends Player {
  vx: number;
  vy: number;
  target: { x: number; y: number };
  speed: number;
  // 'tourist' players bias their waypoints toward zones to exercise auto-detect.
  behavior: 'tourist' | 'wanderer' | 'risk' | 'family-adult' | 'family-hatchling';
  followId?: string; // for the hatchling: stay near this player
  growthRate: number; // %/sec
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class SyntheticDataSource implements PlayerDataSource {
  readonly kind = 'synthetic' as const;
  private players: SimPlayer[] = [];
  private lastTick = Date.now();

  // Reads the current (admin-editable) zones so simulated players path through
  // whatever zones are actually configured.
  constructor(private getZones: () => Zone[]) {
    this.seed();
  }

  getWorldBounds(): WorldBounds {
    return WORLD;
  }

  private seed(): void {
    const zones = this.getZones();
    const zoneCenters = zones.length
      ? zones.map((z) => ({ x: z.x, y: z.y }))
      : [{ x: 0, y: 0 }];

    const make = (
      id: string,
      name: string,
      behavior: SimPlayer['behavior'],
      overrides: Partial<SimPlayer> = {},
    ): SimPlayer => {
      const loc: Location = {
        x: rand(WORLD.minX, WORLD.maxX),
        y: rand(WORLD.minY, WORLD.maxY),
        z: rand(0, 5000),
      };
      return {
        id,
        name,
        location: loc,
        dinoClass: pick(SPECIES),
        growth: rand(20, 70),
        health: rand(70, 100),
        stamina: rand(40, 100),
        hunger: rand(40, 100),
        thirst: rand(40, 100),
        vx: 0,
        vy: 0,
        target: pick(zoneCenters),
        speed: rand(2500, 4500),
        behavior,
        growthRate: 0.02,
        ...overrides,
      };
    };

    // Tourists path through zones -> exercise authoritative auto-detect.
    this.players.push(make('tour-1', 'Apex_Hunter', 'tourist'));
    this.players.push(make('tour-2', 'Riverstrider', 'tourist'));
    this.players.push(make('tour-3', 'NightStalker', 'tourist'));

    // Wanderers move randomly.
    this.players.push(make('wand-1', 'LoneRex', 'wanderer'));
    this.players.push(make('wand-2', 'SwampKing', 'wanderer'));

    // Risk case: high growth, climbing toward 75%, ignores zones.
    this.players.push(
      make('risk-1', 'AlmostElder', 'risk', { growth: 63, growthRate: 0.05 }),
    );

    // Family: an adult and a hatchling spawned together, same species ->
    // exercises hatchedFromEgg + raisedOffspring heuristics.
    const species = pick(SPECIES);
    const adultLoc = { x: rand(-30000, 30000), y: rand(-30000, 30000) };
    this.players.push(
      make('fam-adult', 'MotherDino', 'family-adult', {
        dinoClass: species,
        growth: 75,
        growthRate: 0,
        location: { x: adultLoc.x, y: adultLoc.y, z: 1000 },
      }),
    );
    this.players.push(
      make('fam-hatchling', 'TinyOne', 'family-hatchling', {
        dinoClass: species,
        growth: 1,
        growthRate: 0.06, // grows fast so the demo reaches sub-adult quickly
        followId: 'fam-adult',
        location: { x: adultLoc.x + 1500, y: adultLoc.y + 1500, z: 1000 },
        speed: 5000,
      }),
    );
  }

  private nextTarget(p: SimPlayer): { x: number; y: number } {
    const zones = this.getZones();
    if (p.behavior === 'tourist' && zones.length) {
      // Bias toward zone centers (with jitter) so dwell detection triggers.
      const z = pick(zones);
      return { x: z.x + rand(-3000, 3000), y: z.y + rand(-3000, 3000) };
    }
    return { x: rand(WORLD.minX, WORLD.maxX), y: rand(WORLD.minY, WORLD.maxY) };
  }

  private advance(p: SimPlayer, dt: number): void {
    // Hatchling follows its parent closely.
    if (p.behavior === 'family-hatchling' && p.followId) {
      const parent = this.players.find((x) => x.id === p.followId);
      if (parent) {
        p.target = { x: parent.location.x + 1200, y: parent.location.y + 1200 };
      }
    }

    const d = dist(p.location, p.target);
    if (d < 1500) {
      p.target = this.nextTarget(p);
    } else {
      const ux = (p.target.x - p.location.x) / d;
      const uy = (p.target.y - p.location.y) / d;
      p.location.x += ux * p.speed * dt;
      p.location.y += uy * p.speed * dt;
    }

    // Stat drift.
    p.hunger = clamp(p.hunger - rand(0.1, 0.4) * dt);
    p.thirst = clamp(p.thirst - rand(0.15, 0.5) * dt);
    p.stamina = clamp(p.stamina + rand(-2, 3) * dt);
    // Health dips when starving/dehydrated, otherwise slowly recovers.
    const starving = p.hunger < 15 || p.thirst < 15;
    p.health = clamp(p.health + (starving ? -rand(0.5, 1.5) : rand(-0.2, 0.5)) * dt);
    p.growth = clamp(p.growth + p.growthRate * dt, 0, 100);

    // Auto top-up so demo players don't all starve to death.
    if (p.hunger < 25) p.hunger = clamp(p.hunger + rand(20, 50));
    if (p.thirst < 25) p.thirst = clamp(p.thirst + rand(20, 50));
  }

  async getPlayerData(): Promise<Player[]> {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 5); // seconds, capped
    this.lastTick = now;

    for (const p of this.players) {
      this.advance(p, dt);
    }

    // Return plain Player copies (no internal sim fields leak out).
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      location: { ...p.location },
      dinoClass: p.dinoClass,
      growth: round(p.growth),
      health: round(p.health),
      stamina: round(p.stamina),
      hunger: round(p.hunger),
      thirst: round(p.thirst),
    }));
  }
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number): number {
  return Math.round(v);
}
