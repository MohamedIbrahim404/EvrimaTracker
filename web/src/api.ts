import type { Me, Zone } from './types';

const opts: RequestInit = { credentials: 'same-origin' };

export async function getMe(): Promise<Me> {
  const r = await fetch('/auth/me', opts);
  return r.json();
}

export async function devLogin(name: string, admin: boolean): Promise<void> {
  await fetch(`/auth/dev?as=${encodeURIComponent(name)}&admin=${admin ? 1 : 0}`, opts);
}

export async function linkCharacter(playerName: string): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch('/auth/link', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName }),
  });
  return r.json();
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { ...opts, method: 'POST' });
}

export async function getZones(): Promise<Zone[]> {
  const r = await fetch('/api/zones', opts);
  return r.json();
}

export async function saveZones(zones: Zone[]): Promise<Zone[]> {
  const r = await fetch('/api/zones', {
    ...opts,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(zones),
  });
  return r.json();
}

export async function setObjective(playerId: string, key: string, value: boolean) {
  await fetch('/api/admin/objective', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, key, value }),
  });
}

export async function confirmHeuristic(playerId: string, key: string, value: boolean) {
  await fetch('/api/admin/confirm', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, key, value }),
  });
}
