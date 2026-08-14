import { db } from '../db/client';
import { sseRegistry } from '../lib/sseRegistry';
import { clearRetained } from '../mqtt/handlers';

// If an OTA row has been in-flight for longer than this without reaching a
// terminal state (complete/error/rolled_back), assume the device stalled or
// dropped and mark it error. For our ~1.4MB main-controller firmware over
// LAN this normally takes 15–30s, so 5 minutes is safely past the tail.
const STALL_THRESHOLD_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS  = 60 * 1000;

const IN_FLIGHT = ['pending', 'downloading', 'verifying', 'installing'];

export function startOtaStallSweep() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);
      const stalled = await db.deviceOtaStatus.findMany({
        where:   { status: { in: IN_FLIGHT }, startedAt: { lt: cutoff } },
        include: { device: { select: { mac: true } } },
      });
      if (stalled.length === 0) return;

      for (const row of stalled) {
        const patch = {
          status:      'error',
          error:       'stalled — no progress within timeout',
          completedAt: new Date(),
        };
        await db.deviceOtaStatus.update({ where: { id: row.id }, data: patch });
        // Clear the retained ota/update so a subsequent device connect
        // doesn't kick off the same failed install again.
        clearRetained(row.device.mac, 'ota/update');
        sseRegistry.emit(row.device.mac, {
          type:        'ota',
          otaStatusId: row.id,
          ota:         { ...row, ...patch },
        });
      }
      console.log(`[OtaStallSweep] Marked ${stalled.length} OTA row(s) as errored (stall timeout)`);
    } catch (err: any) {
      console.error('[OtaStallSweep] sweep failed:', err?.message ?? err);
    }
  }, SWEEP_INTERVAL_MS);
}
