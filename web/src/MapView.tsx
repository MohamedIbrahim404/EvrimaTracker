import type { ServerSnapshot, PlayerSnapshot, WorldBounds, Zone } from './types';

const SIZE = 620;

const ZONE_COLORS: Record<string, string> = {
  sanctuary: '#3aa0ff',
  migration: '#33cc88',
  patrol: '#e0a92e',
};

function project(x: number, y: number, b: WorldBounds) {
  const px = ((x - b.minX) / (b.maxX - b.minX)) * SIZE;
  // invert y so world-north is up
  const py = SIZE - ((y - b.minY) / (b.maxY - b.minY)) * SIZE;
  return { px, py };
}

function radiusPx(r: number, b: WorldBounds) {
  return (r / (b.maxX - b.minX)) * SIZE;
}

function healthColor(h: number) {
  if (h >= 66) return '#3ad07a';
  if (h >= 33) return '#e0c531';
  return '#e34d4d';
}

export function MapView({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: ServerSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const b = snapshot.worldBounds;

  return (
    <svg width={SIZE} height={SIZE} className="map" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="#11161d" />
      {/* grid (fallback when no map image present) */}
      {Array.from({ length: 9 }).map((_, i) => {
        const p = (i / 8) * SIZE;
        return (
          <g key={i} stroke="#1d2630" strokeWidth={1}>
            <line x1={p} y1={0} x2={p} y2={SIZE} />
            <line x1={0} y1={p} x2={SIZE} y2={p} />
          </g>
        );
      })}
      {/* Terrain background. Drop a Gateway map image at web/public/gateway-map.jpg
          aligned to worldBounds. If absent, the grid above shows through. */}
      <image href="/gateway-map.jpg" x={0} y={0} width={SIZE} height={SIZE}
        preserveAspectRatio="none" opacity={0.85} />
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="#0a0d11" opacity={0.15} />

      {/* zones */}
      {snapshot.zones.map((z: Zone) => {
        const { px, py } = project(z.x, z.y, b);
        const r = radiusPx(z.radius, b);
        return (
          <g key={z.id}>
            <circle cx={px} cy={py} r={r} fill={ZONE_COLORS[z.type]} fillOpacity={0.12}
              stroke={ZONE_COLORS[z.type]} strokeOpacity={0.5} strokeDasharray="4 3" />
            <text x={px} y={py} fill={ZONE_COLORS[z.type]} fontSize={10} textAnchor="middle"
              opacity={0.8}>{z.name}</text>
          </g>
        );
      })}

      {/* players */}
      {snapshot.players.map((p: PlayerSnapshot) => {
        const { px, py } = project(p.location.x, p.location.y, b);
        const selected = p.id === selectedId;
        return (
          <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
            {p.prime.isPrimeEligible && (
              <circle cx={px} cy={py} r={10} fill="none" stroke="#b06bff" strokeWidth={2} />
            )}
            {p.prime.atRisk && (
              <circle cx={px} cy={py} r={10} fill="none" stroke="#e34d4d" strokeWidth={2}
                strokeDasharray="2 2" />
            )}
            <circle cx={px} cy={py} r={selected ? 7 : 5} fill={healthColor(p.health)}
              stroke={selected ? '#fff' : '#0a0d11'} strokeWidth={selected ? 2 : 1} />
            <text x={px + 9} y={py + 3} fill="#cfd8e3" fontSize={10}>{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
