import { useAuthStore } from '@/store/auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function authFetch(path: string, options: RequestInit = {}) {
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export async function claimDevice(mac: string, name: string): Promise<{ id: string }> {
  return authFetch('/devices/claim', {
    method: 'POST',
    body: JSON.stringify({ mac, name }),
  });
}

export async function updateDeviceName(mac: string, name: string): Promise<void> {
  await authFetch(`/devices/${mac}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export type ConnectionGrade = 'good' | 'degraded' | 'poor' | 'offline';

export type ConnectionStatus = {
  mac: string;
  grade: ConnectionGrade;
  lastSeen: number | null;
  missedPings: number;
  recommendLocalMode: boolean;
  reason: string;
};

export async function getConnectionStatus(mac: string): Promise<ConnectionStatus> {
  return authFetch(`/devices/${mac}/connection-status`);
}

export async function getDeviceZones(mac: string): Promise<unknown[]> {
  return authFetch(`/devices/${mac}/zones`);
}

export async function getDeviceStatus(mac: string): Promise<unknown> {
  return authFetch(`/devices/${mac}`);
}

export async function startZone(mac: string, zoneNumber: number, duration: number): Promise<void> {
  await authFetch(`/devices/${mac}/zones/${zoneNumber}/start`, {
    method: 'POST',
    body: JSON.stringify({ duration }),
  });
}

export async function stopZone(mac: string, zoneNumber: number): Promise<void> {
  await authFetch(`/devices/${mac}/zones/${zoneNumber}/stop`, { method: 'POST' });
}

export async function stopAllZones(mac: string): Promise<void> {
  await authFetch(`/devices/${mac}/zones/stop-all`, { method: 'POST' });
}
