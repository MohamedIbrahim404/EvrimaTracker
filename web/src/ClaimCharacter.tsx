import { useState } from 'react';
import { linkCharacter, logout } from './api';

export function ClaimCharacter({ name }: { name?: string }) {
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await linkCharacter(playerName.trim());
    setBusy(false);
    if (res.ok) location.reload();
    else setError(res.error ?? 'could not link');
  }

  return (
    <div className="center">
      <div className="card">
        <h1>Claim your character</h1>
        <p className="muted">
          Signed in as {name}. Enter your exact in-game name to link it to your account.
          You must be online in-game so the server can match you.
        </p>
        <form onSubmit={claim} className="dev-login">
          <input placeholder="exact in-game name" value={playerName}
            onChange={(e) => setPlayerName(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Linking…' : 'Link character'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <button className="link-btn" onClick={() => logout().then(() => location.reload())}>
          Sign out
        </button>
      </div>
    </div>
  );
}
