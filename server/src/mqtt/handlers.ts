import { db } from '../db/client';
import { sseRegistry } from '../lib/sseRegistry';

// Called when a device publishes to azul/{mac}/status
export async function handleDeviceStatus(mac: string, data: Record<string, unknown>) {
  const firmware  = data.firmware  as string | undefined;
  const ipAddress = data.ip        as string | undefined;
  const now       = new Date();

  try {
    // Try to update an existing claimed device first
    await db.device.update({
      where: { mac },
      data:  { firmware, ipAddress, online: true, lastSeenAt: now },
    });
    // Forward to any connected SSE clients for this device
    sseRegistry.emit(mac, { type: 'status', ...data, online: true, lastSeenAt: now });
  } catch (err: any) {
    if (err.code === 'P2025') {
      // Device not claimed yet — track in pending_devices
      await db.pendingDevice.upsert({
        where:  { mac },
        update: { firmware, ipAddress },
        create: { mac, firmware, ipAddress },
      });
    } else {
      console.error('[MQTT] handleDeviceStatus error:', err.message);
    }
  }
}

// Called when a device publishes to azul/{mac}/events
export async function handleDeviceEvent(mac: string, data: Record<string, unknown>) {
  if (data.type !== 'zone_run') return;

  const zoneNumber      = data.zone     as number;
  const durationSeconds = data.duration as number;
  const source          = (data.source  as string) ?? 'scheduler';
  const ts              = data.ts ? new Date((data.ts as number) * 1000) : new Date();

  try {
    const device = await db.device.findUnique({ where: { mac } });
    if (!device) return; // Unclaimed device — skip

    // Upsert zone (firmware may know zones the backend hasn't seen)
    const zone = await db.zone.upsert({
      where:  { deviceId_number: { deviceId: device.id, number: zoneNumber } },
      update: {},
      create: { deviceId: device.id, number: zoneNumber },
    });

    await db.auditLog.create({
      data: {
        deviceId:        device.id,
        zoneId:          zone.id,
        zoneNumber,
        startedAt:       ts,
        durationSeconds,
        source,
      },
    });
  } catch (err: any) {
    console.error('[MQTT] handleDeviceEvent error:', err.message);
  }
}
