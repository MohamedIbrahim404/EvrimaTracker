import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import type { Zone } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const ZONES_FILE = path.join(DATA_DIR, 'zones.json');

// Default zones live in the SYNTHETIC coordinate space (-100000..100000).
// Sanctuaries are real, fixed Gateway locations by name — their coordinates are
// placeholders until calibrated against the live server's world coordinates.
// Migration/patrol zones ROTATE on live servers; these are samples an admin
// edits per rotation (or that get sourced live later).
const DEFAULT_ZONES: Zone[] = [
  { id: 'sanc-swamp', name: 'Swamp Sanctuary', type: 'sanctuary', x: -55000, y: 20000, radius: 12000 },
  { id: 'sanc-delta', name: 'River Delta Sanctuary', type: 'sanctuary', x: 30000, y: -25000, radius: 14000 },
  { id: 'sanc-water', name: 'Water Access Sanctuary', type: 'sanctuary', x: 10000, y: 55000, radius: 11000 },
  // sample rotating zones (admin-editable)
  { id: 'mig-1', name: 'Migration A', type: 'migration', x: -40000, y: 60000, radius: 14000 },
  { id: 'mig-2', name: 'Migration B', type: 'migration', x: 65000, y: 10000, radius: 14000 },
  { id: 'mig-3', name: 'Migration C', type: 'migration', x: 10000, y: -70000, radius: 14000 },
  { id: 'pat-1', name: 'Patrol Alpha', type: 'patrol', x: -65000, y: -30000, radius: 10000 },
  { id: 'pat-2', name: 'Patrol Bravo', type: 'patrol', x: 45000, y: 55000, radius: 10000 },
  { id: 'pat-3', name: 'Patrol Charlie', type: 'patrol', x: 75000, y: -55000, radius: 10000 },
  { id: 'pat-4', name: 'Patrol Delta', type: 'patrol', x: -30000, y: 30000, radius: 10000 },
];

export class ZoneStore {
  private zones: Zone[];

  constructor() {
    this.zones = this.load();
  }

  private load(): Zone[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8')) as Zone[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to defaults */
    }
    return structuredClone(DEFAULT_ZONES);
  }

  private save(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ZONES_FILE, JSON.stringify(this.zones, null, 2));
  }

  all(): Zone[] {
    return this.zones;
  }

  // Replace the whole set (admin "save zones").
  replaceAll(zones: Zone[]): Zone[] {
    this.zones = zones.map((z) => ({ ...z, id: z.id || crypto.randomUUID() }));
    this.save();
    return this.zones;
  }

  upsert(zone: Zone): Zone {
    const z = { ...zone, id: zone.id || crypto.randomUUID() };
    const i = this.zones.findIndex((x) => x.id === z.id);
    if (i === -1) this.zones.push(z);
    else this.zones[i] = z;
    this.save();
    return z;
  }

  remove(id: string): void {
    this.zones = this.zones.filter((z) => z.id !== id);
    this.save();
  }
}
