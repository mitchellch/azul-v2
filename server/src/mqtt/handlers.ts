import { db } from '../db/client';
import { sseRegistry } from '../lib/sseRegistry';
import { recordPing, recordDisconnect } from '../lib/connectionMonitor';
import { zoneStateCache } from '../lib/zoneStateCache';
import { toPayload } from '../lib/scheduleSerializer';

type PublishFn = (mac: string, command: string, payload: object) => void;
let _publish: PublishFn = () => {};
export function setPublishFn(fn: PublishFn) { _publish = fn; }

// Track which devices were already online so we only re-push on reconnect
const onlineDevices = new Set<string>();

// Called when a device publishes to azul/{mac}/status
export async function handleDeviceStatus(mac: string, data: Record<string, unknown>) {
  const firmware  = data.firmware  as string | undefined;
  const ipAddress = data.ip        as string | undefined;
  const now       = new Date();

  recordPing(mac);

  // Cache live zone states so the poll endpoint can return them
  if (Array.isArray(data.zones)) {
    zoneStateCache.update(mac, (data.zones as any[]).map(z => ({
      id:      z.id,
      status:  z.status,
      runtime: z.runtime,
      source:  z.source,
    })));
  }

  try {
    const wasOnline = onlineDevices.has(mac);
    onlineDevices.add(mac);

    // Try to update an existing claimed device first
    const device = await db.device.update({
      where: { mac },
      data:  { firmware, ipAddress, online: true, lastSeenAt: now },
    });

    // Re-push all schedules on reconnect so firmware stays in sync
    if (!wasOnline) {
      const schedules = await db.schedule.findMany({
        where:   { deviceId: device.id },
        include: { runs: true },
      });
      for (const s of schedules) {
        _publish(mac, 'schedule/set', toPayload(s));
      }
      const active = schedules.find(s => s.active);
      if (active) {
        _publish(mac, 'schedule/activate', { uuid: active.uuid });
      }
      if (schedules.length > 0) {
        console.log(`[MQTT] Re-pushed ${schedules.length} schedule(s) to ${mac} on reconnect`);
      }
    }

    // Forward to SSE clients — use cache (not raw MQTT data) so grace-period protection applies
    const cachedZones = zoneStateCache.get(mac);
    sseRegistry.emit(mac, {
      type: 'status',
      ...data,
      zones: cachedZones.map(z => ({ id: z.id, status: z.status, runtime: z.runtime, source: z.source })),
      online: true,
      lastSeenAt: now,
    });
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

// Called when the broker delivers the LWT or an explicit online/offline message
export async function handleDeviceConnection(mac: string, data: Record<string, unknown>) {
  const online = data.online === true;
  if (!online) {
    recordDisconnect(mac);
    onlineDevices.delete(mac);
    sseRegistry.emit(mac, { type: 'connection', online: false });
    try {
      await db.device.updateMany({ where: { mac }, data: { online: false } });
    } catch { /* device may not be claimed */ }
  } else {
    recordPing(mac);
    sseRegistry.emit(mac, { type: 'connection', online: true });
  }
}

// Called when a device publishes to azul/{mac}/events
export async function handleDeviceEvent(mac: string, data: Record<string, unknown>) {
  const type = data.type as string;

  if (type === 'zone_start') {
    const zoneNumber      = data.zone     as number;
    const durationSeconds = data.duration as number;
    const source          = (data.source  as string) ?? 'manual';
    zoneStateCache.update(mac, [{ id: zoneNumber, status: 'running', runtime: durationSeconds, source }]);
    const cachedZones = zoneStateCache.get(mac);
    sseRegistry.emit(mac, { type: 'status', zones: cachedZones.map(z => ({ id: z.id, status: z.status, runtime: z.runtime, source: z.source })) });
  }

  if (type === 'zone_stop') {
    const zoneNumber = data.zone as number;
    zoneStateCache.update(mac, [{ id: zoneNumber, status: 'idle', runtime: 0 }]);
    const cachedZones = zoneStateCache.get(mac);
    sseRegistry.emit(mac, { type: 'status', zones: cachedZones.map(z => ({ id: z.id, status: z.status, runtime: z.runtime, source: z.source })) });
  }

  if (type !== 'zone_start' && type !== 'zone_stop' && type !== 'zone_run') return;

  const zoneNumber      = data.zone     as number;
  const durationSeconds = (data.duration as number) ?? 0;
  const source          = (data.source  as string) ?? 'scheduler';
  const ts              = data.ts ? new Date((data.ts as number) * 1000) : new Date();

  // Only write audit log for zone_start (or legacy zone_run)
  if (type !== 'zone_stop') {
    try {
      const device = await db.device.findUnique({ where: { mac } });
      if (!device) return;

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

    // Only sync active state from device if it reported at least one schedule
    // (empty list on fresh boot doesn't mean DB schedules were deleted)
    if (schedules.length > 0) {
      await db.schedule.updateMany({
        where: { deviceId: device.id, uuid: { notIn: schedules.map((s: any) => s.uuid) } },
        data:  { active: false },
      });
    }

    console.log(`[MQTT] Synced ${schedules.length} schedule(s) for ${mac}`);
    sseRegistry.emit(mac, { type: 'schedules_synced', count: schedules.length });
  } catch (err: any) {
    console.error('[MQTT] handleDeviceSchedules error:', err.message);
  }
}
