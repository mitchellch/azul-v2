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
