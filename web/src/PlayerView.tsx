import type { ServerSnapshot, PlayerSnapshot } from './types';
import { MapView } from './MapView';

function tierClass(tier: string) {
  return `tier tier-${tier}`;
}

function PrimeList({ player }: { player: PlayerSnapshot }) {
  return (
    <div className="objectives">
      {player.prime.objectives.map((o) => (
        <div key={o.key} className={`obj ${o.done ? 'done' : ''}`}>
          <span className={`dot ${o.done ? 'on' : ''}`} />
          <span className="obj-label">
            {o.label} <span className={tierClass(o.tier)}>{o.tier}</span>
            {o.detail && <span className="obj-detail">{o.detail}</span>}
            {o.suggested && !o.done && <span className="suggested">pending admin confirm</span>}
          </span>
          <span className={`auto ${o.done ? 'on' : ''}`}>{o.done ? '✓' : '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function PlayerView({ snapshot }: { snapshot: ServerSnapshot }) {
  const me = snapshot.players[0];

  if (!me) {
    return (
      <div className="panel">
        <h2>You’re offline</h2>
        <p className="muted">
          We can’t see your character right now. Spawn in on the server and your
          live stats will appear here.
        </p>
      </div>
    );
  }

  const pr = me.prime;
  return (
    <div className="layout">
      <div className="left">
        <MapView snapshot={snapshot} selectedId={me.id} onSelect={() => {}} />
        <p className="muted small">Your location on the island. Only you can see this.</p>
      </div>
      <aside className="right">
        <div className="panel">
          <div className="panel-head">
            <h2>{me.name}</h2>
            <span className="muted">{me.dinoClass} · growth {me.growth}%</span>
          </div>
          <div className="stats">
            <Stat label="Health" value={me.health} />
            <Stat label="Stamina" value={me.stamina} />
            <Stat label="Hunger" value={me.hunger} />
            <Stat label="Thirst" value={me.thirst} />
          </div>
          <div className="prime-head">
            <strong>Prime Elder</strong>
            <span>{pr.completedCount}/{pr.required} required</span>
            {pr.locked
              ? <span className={`badge ${pr.isPrimeEligible ? 'good' : 'bad'}`}>{pr.isPrimeEligible ? 'ACHIEVED' : 'MISSED'}</span>
              : pr.isPrimeEligible ? <span className="badge good">ELIGIBLE</span>
              : pr.atRisk ? <span className="badge warn">AT RISK</span>
              : <span className="badge">growing</span>}
          </div>
          <PrimeList player={me} />
          <p className="hint">
            Earn at least {pr.required} of 8 before 75% growth. Zone visits are tracked
            automatically; egg/offspring objectives are confirmed by an admin; diet-related
            ones aren’t exposed by the game, so an admin marks those.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}%</span>
    </div>
  );
}
