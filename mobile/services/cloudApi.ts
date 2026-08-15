import { useAuthStore } from '@/store/auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function authFetch(path: string, options: RequestInit = {}, signal?: AbortSignal) {
  const { accessToken, clearSession } = useAuthStore.getState();
  if (!accessToken) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    signal,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearSession();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[cloudApi] ${options.method ?? 'GET'} ${path} → ${res.status}`, body);
    throw new Error(body.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export type ServerDevice = {
  id: string;
  mac: string;
  name: string | null;
  createdAt: string;
  lastSeenAt: string | null;
};

export async function fetchDevices(): Promise<ServerDevice[]> {
  return authFetch('/devices');
}

export type OtaStatusRow = {
  id:          string;
  version:     string;
  status:      'pending' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error' | 'rolled_back';
  progress:    number;
  error:       string | null;
  startedAt:   string;
  completedAt: string | null;
};

export async function triggerOta(mac: string, version: string): Promise<{ ok: boolean; existing?: boolean; status: OtaStatusRow }> {
  return authFetch(`/devices/${mac}/ota`, {
    method: 'POST',
    body:   JSON.stringify({ version }),
  });
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

export async function updateZoneName(mac: string, zoneNumber: number, name: string): Promise<void> {
  await authFetch(`/devices/${mac}/zones/${zoneNumber}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function updateZoneColor(mac: string, zoneNumber: number, color: string | null): Promise<void> {
  await authFetch(`/devices/${mac}/zones/${zoneNumber}`, {
    method: 'PUT',
    body: JSON.stringify({ color }),
  });
}

export async function getDeviceConfig(mac: string): Promise<unknown> {
  return authFetch(`/devices/${mac}/config`);
}

export async function uploadZonePhoto(mac: string, zoneNumber: number, uri: string): Promise<{ photoUrl: string }> {
  const { accessToken, clearSession } = useAuthStore.getState();
  if (!accessToken) throw new Error('Not authenticated');

  const formData = new FormData();
  const filename = uri.split('/').pop() ?? 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  formData.append('photo', { uri, name: filename, type: mimeType } as any);

  const res = await fetch(`${API_URL}/devices/${mac}/zones/${zoneNumber}/photo`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: formData,
  });

  if (res.status === 401) { clearSession(); throw new Error('Session expired'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed ${res.status}`);
  }
  return res.json();
}

export async function deleteZonePhoto(mac: string, zoneNumber: number): Promise<void> {
  await authFetch(`/devices/${mac}/zones/${zoneNumber}/photo`, { method: 'DELETE' });
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

export async function getDeviceStatus(mac: string, signal?: AbortSignal): Promise<unknown> {
  return authFetch(`/devices/${mac}`, {}, signal);
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

// Programs — user-facing scheduling. Server compiles active programs into a
// synthetic Schedule for the firmware, so the mobile app never touches
// Schedule endpoints directly.
export type ProgramPayload = {
  id?:          string;
  name:         string;
  dayMask:      number;
  intervalDays: number;
  startDate:    string;
  endDate:      string | null;
  active:       boolean;
  startTimes:   { hour: number; minute: number }[];
  zones:        { zoneNumber: number; durationSeconds: number; order: number }[];
};

export async function getPrograms(mac: string): Promise<ProgramPayload[]> {
  return authFetch(`/devices/${mac}/programs`);
}

export async function createProgram(mac: string, program: ProgramPayload): Promise<ProgramPayload> {
  const { id: _drop, ...body } = program;
  return authFetch(`/devices/${mac}/programs`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateProgram(mac: string, id: string, program: ProgramPayload): Promise<ProgramPayload> {
  const { id: _drop, ...body } = program;
  return authFetch(`/devices/${mac}/programs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteProgram(mac: string, id: string): Promise<void> {
  await authFetch(`/devices/${mac}/programs/${id}`, { method: 'DELETE' });
}

export async function activateProgram(mac: string, id: string): Promise<ProgramPayload> {
  return authFetch(`/devices/${mac}/programs/${id}/activate`, { method: 'POST' });
}

export async function deactivateProgram(mac: string, id: string): Promise<ProgramPayload> {
  return authFetch(`/devices/${mac}/programs/${id}/deactivate`, { method: 'POST' });
}
