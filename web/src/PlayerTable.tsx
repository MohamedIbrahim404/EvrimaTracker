import type { PlayerSnapshot } from './types';

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${value}%`, background: color }} />
      <span className="bar-label">{value}</span>
    </div>
  );
}

const hp = (h: number) => (h >= 66 ? '#3ad07a' : h >= 33 ? '#e0c531' : '#e34d4d');

export function PlayerTable({
  players,
  selectedId,
  onSelect,
}: {
  players: PlayerSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sorted = [...players].sort((a, b) => b.prime.completedCount - a.prime.completedCount);
  return (
    <table className="player-table">
      <thead>
        <tr>
          <th>Player</th><th>Class</th><th>Growth</th><th>Health</th>
          <th>Hunger</th><th>Thirst</th><th>Prime</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.id} className={p.id === selectedId ? 'sel' : ''} onClick={() => onSelect(p.id)}>
            <td>{p.name}</td>
            <td className="muted">{p.dinoClass}</td>
            <td>{p.growth}%</td>
            <td style={{ minWidth: 90 }}><Bar value={p.health} color={hp(p.health)} /></td>
            <td>{p.hunger}</td>
            <td>{p.thirst}</td>
            <td>{p.prime.completedCount}/{p.prime.required}</td>
            <td>
              {p.prime.locked ? (
                <span className={`badge ${p.prime.isPrimeEligible ? 'good' : 'bad'}`}>
                  {p.prime.isPrimeEligible ? 'PRIME' : 'MISSED'}
                </span>
              ) : p.prime.isPrimeEligible ? (
                <span className="badge good">ELIGIBLE</span>
              ) : p.prime.atRisk ? (
                <span className="badge warn">AT RISK</span>
              ) : (
                <span className="badge">growing</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
