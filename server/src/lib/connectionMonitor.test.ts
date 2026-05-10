import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { recordPing, getConnectionStatus } from './connectionMonitor';

// We need to control time to test time-based grading
// connectionMonitor uses Date.now() internally — we patch it via vi.spyOn

function setNow(ms: number) {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
}

const T0 = 1_000_000_000_000; // arbitrary fixed epoch ms

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(T0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// connectionMonitor holds module-level state — isolate tests by using unique MACs
let seq = 0;
function mac() { return `AA:BB:CC:DD:EE:${String(seq++).padStart(2, '0')}`; }

describe('getConnectionStatus — no pings', () => {
  it('returns offline when no pings recorded', () => {
    const status = getConnectionStatus(mac());
    expect(status.status).toBe('offline');
    expect(status.recommendLocalMode).toBe(true);
    expect(status.lastSeen).toBeNull();
  });
});

describe('getConnectionStatus — good', () => {
  it('grades as good when last ping < 30s ago', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 15_000); // 15s later
    const status = getConnectionStatus(m);
    expect(status.status).toBe('good');
    expect(status.recommendLocalMode).toBe(false);
  });

  it('grades as good with regular pings and no misses', () => {
    const m = mac();
    // Simulate 5 regular pings, 60s apart
    for (let i = 0; i < 5; i++) {
      setNow(T0 + i * 60_000);
      recordPing(m);
    }
    setNow(T0 + 4 * 60_000 + 10_000); // 10s after last ping
    const status = getConnectionStatus(m);
    expect(status.status).toBe('good');
    expect(status.missedPings).toBe(0);
  });
});

describe('getConnectionStatus — degraded', () => {
  it('grades as degraded when last ping is 31–60s ago', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 45_000); // 45s later
    const status = getConnectionStatus(m);
    expect(status.status).toBe('degraded');
    expect(status.recommendLocalMode).toBe(false);
  });

  it('grades as degraded when last ping is between 30s and 60s ago', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 50_000); // 50s later — in degraded range
    const status = getConnectionStatus(m);
    expect(status.status).toBe('degraded');
    expect(status.missedPings).toBeGreaterThanOrEqual(0);
  });
});

describe('getConnectionStatus — poor', () => {
  it('grades as poor when last ping is 61–120s ago', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 90_000); // 90s later
    const status = getConnectionStatus(m);
    expect(status.status).toBe('poor');
    expect(status.recommendLocalMode).toBe(true);
  });

  it('grades as poor with 3+ missed pings over a long window', () => {
    const m = mac();
    // Ping at T0, then only once more 5 minutes later — window is 5min, expected ~5 pings, got 2
    setNow(T0);
    recordPing(m);
    setNow(T0 + 5 * 60_000);
    recordPing(m);
    setNow(T0 + 5 * 60_000 + 5_000); // 5s after last ping
    const status = getConnectionStatus(m);
    expect(status.missedPings).toBeGreaterThanOrEqual(3);
    expect(status.status).toBe('poor');
  });
});

describe('getConnectionStatus — offline', () => {
  it('grades as offline when last ping > 120s ago', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 121_000); // just over 2 minutes
    const status = getConnectionStatus(m);
    expect(status.status).toBe('offline');
    expect(status.recommendLocalMode).toBe(true);
  });

  it('includes lastSeen timestamp when previously seen', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 200_000);
    const status = getConnectionStatus(m);
    expect(status.lastSeen).toBe(new Date(T0).toISOString());
  });
});

describe('rolling window', () => {
  it('prunes pings older than 5 minutes', () => {
    const m = mac();
    // Record old pings at T0
    for (let i = 0; i < 3; i++) {
      setNow(T0 + i * 1000);
      recordPing(m);
    }
    // Jump 6 minutes — old pings should be pruned, then record a fresh one
    setNow(T0 + 6 * 60_000);
    recordPing(m);
    setNow(T0 + 6 * 60_000 + 5_000);
    const status = getConnectionStatus(m);
    // Only the fresh ping remains — last seen is recent so it's good/degraded
    expect(['good', 'degraded']).toContain(status.status);
  });
});

describe('pingIntervalAvgMs', () => {
  it('is null with fewer than 2 pings', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 5_000);
    const status = getConnectionStatus(m);
    expect(status.pingIntervalAvgMs).toBeNull();
  });

  it('calculates average interval correctly', () => {
    const m = mac();
    setNow(T0);
    recordPing(m);
    setNow(T0 + 60_000);
    recordPing(m);
    setNow(T0 + 120_000);
    recordPing(m);
    setNow(T0 + 125_000);
    const status = getConnectionStatus(m);
    expect(status.pingIntervalAvgMs).toBe(60_000);
  });
});
