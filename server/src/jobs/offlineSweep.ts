import { db } from '../db/client';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes
const SWEEP_INTERVAL_MS    = 2 * 60 * 1000;  // every 2 minutes

export function startOfflineSweep() {
  setInterval(async () => {
    const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
    const result = await db.device.updateMany({
      where: { online: true, lastSeenAt: { lt: cutoff } },
      data:  { online: false },
    });
    if (result.count > 0) {
      console.log(`[OfflineSweep] Marked ${result.count} device(s) offline`);
    }
  }, SWEEP_INTERVAL_MS);
}
