// Per-device MQTT health tracking using a rolling 5-minute window of status pings.
// Grades each controller as "good" | "degraded" | "poor" | "offline".

const WINDOW_MS       = 5 * 60 * 1000; // 5-minute rolling window
const EXPECTED_GAP_MS = 60 * 1000;     // controller publishes status every ~60s

type PingRecord = { ts: number };

interface DeviceMetrics {
  pings: PingRecord[];
  lastSeen: number; // ms since epoch
}

const metrics = new Map<string, DeviceMetrics>();

export type ConnectionGrade = 'good' | 'degraded' | 'poor' | 'offline';

export interface ConnectionStatus {
  status: ConnectionGrade;
  lastSeen: string | null;
  missedPings: number;
  pingIntervalAvgMs: number | null;
  recommendLocalMode: boolean;
  reason: string;
}

function getOrCreate(mac: string): DeviceMetrics {
  if (!metrics.has(mac)) metrics.set(mac, { pings: [], lastSeen: 0 });
  return metrics.get(mac)!;
}

function prune(m: DeviceMetrics) {
  const cutoff = Date.now() - WINDOW_MS;
  m.pings = m.pings.filter(p => p.ts >= cutoff);
}

// Called by MQTT handler every time a status message arrives from a device.
export function recordPing(mac: string) {
  const m = getOrCreate(mac);
  const now = Date.now();
  m.pings.push({ ts: now });
  m.lastSeen = now;
  prune(m);
}

export function getConnectionStatus(mac: string): ConnectionStatus {
  const m = metrics.get(mac);
  const now = Date.now();

  if (!m || m.lastSeen === 0) {
    return {
      status: 'offline',
      lastSeen: null,
      missedPings: 0,
      pingIntervalAvgMs: null,
      recommendLocalMode: true,
      reason: 'No status messages received from controller',
    };
  }

  // Capture first ping timestamp before pruning so we know how long we've been observing
  const firstPingBeforePrune = m.pings[0]?.ts ?? now;

  prune(m);

  const ageSec = (now - m.lastSeen) / 1000;

  // Compute average ping interval from the rolling window
  let pingIntervalAvgMs: number | null = null;
  if (m.pings.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < m.pings.length; i++) {
      intervals.push(m.pings[i].ts - m.pings[i - 1].ts);
    }
    pingIntervalAvgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  // Estimate how many pings we should have received since we first saw the device
  const windowSec = (now - firstPingBeforePrune) / 1000;
  const expectedPings = Math.max(1, Math.floor(windowSec / (EXPECTED_GAP_MS / 1000)));
  const missedPings = Math.max(0, expectedPings - m.pings.length);

  let status: ConnectionGrade;
  let reason: string;

  if (ageSec > 120) {
    status = 'offline';
    reason = `No message for ${Math.round(ageSec)}s`;
  } else if (ageSec > 60 || missedPings >= 3) {
    status = 'poor';
    reason = ageSec > 60
      ? `Last message ${Math.round(ageSec)}s ago`
      : `${missedPings} missed ping(s) in last 5 minutes`;
  } else if (ageSec > 30 || missedPings >= 1) {
    status = 'degraded';
    reason = ageSec > 30
      ? `Last message ${Math.round(ageSec)}s ago`
      : `${missedPings} missed ping(s) in last 5 minutes`;
  } else {
    status = 'good';
    reason = `Last message ${Math.round(ageSec)}s ago`;
  }

  return {
    status,
    lastSeen: new Date(m.lastSeen).toISOString(),
    missedPings,
    pingIntervalAvgMs: pingIntervalAvgMs ? Math.round(pingIntervalAvgMs) : null,
    recommendLocalMode: status === 'poor' || status === 'offline',
    reason,
  };
}
