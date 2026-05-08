import { db } from '../db/client';

// Called when a device publishes to azul/{mac}/status
export async function handleDeviceStatus(mac: string, data: Record<string, unknown>) {
  try {
    // Upsert device — creates it if first time seen
    await db.device.upsert({
      where:  { mac },
      update: {
        firmware:   (data.firmware  as string) ?? undefined,
        ipAddress:  (data.ip        as string) ?? undefined,
        lastSeenAt: new Date(),
      },
      create: {
        mac,
        name:       `Azul Controller (${mac.slice(-8)})`,
        firmware:   (data.firmware as string) ?? undefined,
        ipAddress:  (data.ip       as string) ?? undefined,
        lastSeenAt: new Date(),
        // No userId — device is unregistered until a user claims it
        user: { connect: { id: 'UNREGISTERED' } },
      },
    });
  } catch (err: unknown) {
    // Device may not be registered yet — log but don't crash
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('UNREGISTERED')) {
      console.error('[MQTT] handleDeviceStatus error:', msg);
    }
  }
}
