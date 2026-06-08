import { useState } from 'react';
import type { Me } from './types';
import { devLogin } from './api';

export function Login({ me }: { me: Me }) {
  const [name, setName] = useState('');
  const [admin, setAdmin] = useState(false);

  async function doDev(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await devLogin(name.trim(), admin);
    location.reload();
  }

  return (
    <div className="center">
      <div className="card">
        <h1>Evrima Tracker</h1>
        <p className="muted">Sign in to view your stats, location, and Prime Elder progress.</p>

        {me.discordConfigured && (
          <a className="btn discord" href="/auth/discord">Sign in with Discord</a>
        )}

        {me.devAllowed && (
          <form onSubmit={doDev} className="dev-login">
            <div className="divider">dev login</div>
            <input placeholder="in-game name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
              admin
            </label>
            <button type="submit" className="btn">Enter</button>
          </form>
        )}

        {!me.discordConfigured && !me.devAllowed && (
          <p className="muted">No login method configured. Set Discord OAuth or enable dev login.</p>
        )}
      </div>
    </div>
  );
}
