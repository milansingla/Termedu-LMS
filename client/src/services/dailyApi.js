const BASE = '/api';

export async function createRoom(roomName) {
  const res = await fetch(`${BASE}/create-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.info || data.error || data.message || 'Failed to create room');
  return data;
}

export async function getToken({ roomName, isOwner, userName, userId }) {
  const res = await fetch(`${BASE}/get-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, isOwner, userName, userId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.info || data.error || data.message || 'Failed to get token');
  return data;
}

export async function getRooms() {
  const res = await fetch(`${BASE}/rooms`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch rooms');
  return data;
}

export async function deleteRoom(roomName) {
  const res = await fetch(`${BASE}/rooms/${roomName}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete room');
  return data;
}
