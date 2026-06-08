import { useEffect, useState } from 'react';
import type { Me } from './types';
import { getMe, logout } from './api';
import { useLiveData } from './useLiveData';
import { MapView } from './MapView';
import { PlayerTable } from './PlayerTable';
import { AdminPanel } from './AdminPanel';
import { ZoneEditor } from './ZoneEditor';
import { PlayerView } from './PlayerView';
import { Login } from './Login';
import { ClaimCharacter } from './ClaimCharacter';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (error) return (
    <div className="center">
      <div className="card">
        <h1>Can’t reach the server</h1>
        <p className="muted">
          The app loaded but couldn’t talk to the backend (<code>/auth/me</code>).
          Make sure the server is running on :4000 — in dev mode start both the
          server and the web dev server.
        </p>
        <p className="error">{error}</p>
      </div>
    </div>
  );
  if (!me) return <div className="center"><span className="muted">Loading…</span></div>;
  if (!me.authenticated) return <Login me={me} />;
  if (me.needsLink) return <ClaimCharacter name={me.name} />;

  return me.isAdmin ? <AdminApp /> : <PlayerApp me={me} />;
}

function PlayerApp({ me }: { me: Me }) {
  const { snapshot, status } = useLiveData();
  return (
    <div className="app">
      <header>
        <h1>Evrima Tracker</h1>
        <div className="meta">
          <span className={`status ${status}`}>{status}</span>
          <span className="muted">{me.name}</span>
          <button className="link-btn" onClick={() => logout().then(() => location.reload())}>sign out</button>
        </div>
      </header>
      {!snapshot ? <div className="loading">Waiting for server data…</div> : <PlayerView snapshot={snapshot} />}
    </div>
  );
}

function AdminApp() {
  const { snapshot, status } = useLiveData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const players = snapshot?.players ?? [];
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="app">
      <header>
        <h1>Evrima Tracker <span className="role">admin</span></h1>
        <div className="meta">
          {snapshot && <span className="src">source: {snapshot.dataSource}</span>}
          <span className={`status ${status}`}>{status}</span>
          <span className="muted">{players.length} players</span>
          <button className="link-btn" onClick={() => logout().then(() => location.reload())}>sign out</button>
        </div>
      </header>

      {!snapshot ? (
        <div className="loading">Waiting for server data…</div>
      ) : (
        <div className="layout">
          <div className="left">
            <MapView snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="legend">
              <span><i className="sw sanctuary" /> sanctuary</span>
              <span><i className="sw migration" /> migration</span>
              <span><i className="sw patrol" /> patrol</span>
              <span><i className="sw elig" /> prime eligible</span>
              <span><i className="sw risk" /> at risk</span>
            </div>
            <PlayerTable players={players} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <aside className="right">
            <AdminPanel player={selected} />
            <ZoneEditor />
          </aside>
        </div>
      )}
    </div>
  );
}
