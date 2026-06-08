import type { PlayerSnapshot, ObjectiveState } from './types';
import { setObjective, confirmHeuristic } from './api';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}%</span>
    </div>
  );
}

function ObjectiveRow({ player, o }: { player: PlayerSnapshot; o: ObjectiveState }) {
  const tierTag = <span className={`tier tier-${o.tier}`}>{o.tier}</span>;

  let control: React.ReactNode = null;
  if (o.tier === 'manual') {
    control = (
      <input type="checkbox" checked={o.done} disabled={player.prime.locked}
        onChange={(e) => setObjective(player.id, o.key, e.target.checked)} />
    );
  } else if (o.tier === 'heuristic') {
    control = (
      <label className="confirm">
        <input type="checkbox" checked={o.done} disabled={player.prime.locked}
          onChange={(e) => confirmHeuristic(player.id, o.key, e.target.checked)} />
        confirm
      </label>
    );
  } else {
    control = <span className={`auto ${o.done ? 'on' : ''}`}>{o.done ? 'detected' : 'tracking'}</span>;
  }

  return (
    <div className={`obj ${o.done ? 'done' : ''}`}>
      <span className={`dot ${o.done ? 'on' : ''}`} />
      <span className="obj-label">
        {o.label} {tierTag}
        {o.detail && <span className="obj-detail">{o.detail}</span>}
        {o.suggested && !o.done && <span className="suggested">suggested ✓</span>}
      </span>
      {control}
    </div>
  );
}

export function AdminPanel({ player }: { player: PlayerSnapshot | null }) {
  if (!player) {
    return <div className="panel empty">Select a player on the map or table.</div>;
  }
  const pr = player.prime;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{player.name}</h2>
        <span className="muted">{player.dinoClass} · growth {player.growth}%</span>
      </div>

      <div className="stats">
        <Stat label="Health" value={player.health} />
        <Stat label="Stamina" value={player.stamina} />
        <Stat label="Hunger" value={player.hunger} />
        <Stat label="Thirst" value={player.thirst} />
      </div>

      <div className="prime-head">
        <strong>Prime Elder</strong>
        <span>{pr.completedCount}/{pr.required} required</span>
        {pr.locked
          ? <span className={`badge ${pr.isPrimeEligible ? 'good' : 'bad'}`}>{pr.isPrimeEligible ? 'ACHIEVED' : 'MISSED (≥75%)'}</span>
          : pr.isPrimeEligible ? <span className="badge good">ELIGIBLE</span>
          : pr.atRisk ? <span className="badge warn">AT RISK</span>
          : <span className="badge">growing</span>}
      </div>

      <div className="objectives">
        {pr.objectives.map((o) => <ObjectiveRow key={o.key} player={player} o={o} />)}
      </div>

      <p className="hint">
        Authoritative objectives auto-detect from location. Heuristic ones are
        suggested by movement patterns — confirm them. Manual ones aren’t exposed
        by RCON, so set them by hand.
      </p>
    </div>
  );
}
