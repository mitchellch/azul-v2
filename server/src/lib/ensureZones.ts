import { db } from '../db/client';
import { MAX_ZONES } from './constants';

// Back-fills zone rows 1..MAX_ZONES for every device on boot.
// Idempotent — devices that already have the full set get zero writes.
// Older devices (created when the count was 8) get rows 9..MAX_ZONES added.
export async function ensureZones(): Promise<void> {
  const devices = await db.device.findMany({ select: { id: true, mac: true } });
  let added = 0;
  for (const d of devices) {
    const result = await db.zone.createMany({
      data: Array.from({ length: MAX_ZONES }, (_, i) => ({
        deviceId: d.id,
        number: i + 1,
      })),
      skipDuplicates: true,
    });
    added += result.count;
    if (result.count > 0) {
      console.log(`[ensureZones] ${d.mac}: added ${result.count} zone rows`);
    }
  }
  console.log(`[ensureZones] complete — ${added} rows added across ${devices.length} devices`);
}
