// Central API client
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function startMission(payload) {
  const res = await fetch(`${BASE}/api/mission/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMission(id) {
  const res = await fetch(`${BASE}/api/mission/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendChat(payload) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
