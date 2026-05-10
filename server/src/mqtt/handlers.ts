import { db } from '../db/client';
import { sseRegistry } from '../lib/sseRegistry';
import { recordPing } from '../lib/connectionMonitor';

// Called when a device publishes to azul/{mac}/status
export async function handleDeviceStatus(mac: string, data: Record<string, unknown>) {
  const firmware  = data.firmware  as string | undefined;
  const ipAddress = data.ip        as string | undefined;
  const now       = new Date();

  recordPing(mac);

  try {
    // Try to update an existing claimed device first
    await db.device.update({
      where: { mac },
      data:  { firmware, ipAddress, online: true, lastSeenAt: now },
    });
    // Forward to SSE clients — include zone array if present
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

// Called when a device publishes to azul/{mac}/schedules
// Syncs the controller's full schedule list to the backend DB
export async function handleDeviceSchedules(mac: string, data: Record<string, unknown>) {
  try {
    const device = await db.device.findUnique({ where: { mac } });
    if (!device) return; // Unclaimed device — skip

    const schedules = data.schedules as any[];
    const activeUuid = (data.active_uuid as string) ?? '';
    if (!Array.isArray(schedules)) return;

    // Sync each schedule — upsert by uuid
    for (const s of schedules) {
      if (!s.uuid || !s.name) continue;

      // Upsert the schedule
      const schedule = await db.schedule.upsert({
        where:  { uuid: s.uuid },
        update: {
          name:      s.name,
          startDate: s.start_date,
          endDate:   s.end_date ?? null,
          active:    s.uuid === activeUuid,
        },
        create: {
          deviceId:  device.id,
          uuid:      s.uuid,
          name:      s.name,
          startDate: s.start_date,
          endDate:   s.end_date ?? null,
          active:    s.uuid === activeUuid,
        },
      });

      // Sync runs — replace all existing runs
      if (Array.isArray(s.runs)) {
        await db.scheduleRun.deleteMany({ where: { scheduleId: schedule.id } });
        await db.scheduleRun.createMany({
          data: s.runs.map((r: any) => ({
            scheduleId:      schedule.id,
            zoneNumber:      r.zone_id,
            dayMask:         r.day_mask ?? 127,
            hour:            r.hour ?? 0,
            minute:          r.minute ?? 0,
            durationSeconds: r.duration_seconds ?? 300,
            intervalDays:    r.interval_days ?? 1,
          })),
        });
      }
    }

    // Deactivate any schedules in DB that are no longer active on the controller
    await db.schedule.updateMany({
      where: { deviceId: device.id, uuid: { notIn: schedules.map((s: any) => s.uuid) } },
      data:  { active: false },
    });

    console.log(`[MQTT] Synced ${schedules.length} schedule(s) for ${mac}`);
    sseRegistry.emit(mac, { type: 'schedules_synced', count: schedules.length });
  } catch (err: any) {
    console.error('[MQTT] handleDeviceSchedules error:', err.message);
  }
}
