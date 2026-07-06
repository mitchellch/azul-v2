import { db } from '../db/client';
import { sseRegistry } from '../lib/sseRegistry';
import { recordPing, recordDisconnect } from '../lib/connectionMonitor';
import { zoneStateCache } from '../lib/zoneStateCache';
import { logEvent } from '../lib/eventLog';

type PublishFn = (mac: string, command: string, payload: object) => void;
let _publish: PublishFn = () => {};
export function setPublishFn(fn: PublishFn) { _publish = fn; }

// Track which devices were already online so we only re-push on reconnect
const onlineDevices = new Set<string>();

// ---------------------------------------------------------------------------
// Stats accumulator — logs once per minute instead of per-message
// ---------------------------------------------------------------------------
export const mqttStats = {
  statusPings: 0,
  configRequests: 0,
  configPushes: 0,
  configAcks: 0,
  events: 0,
  connections: 0,
  disconnections: 0,
  errors: 0,
  devices: new Set<string>(),
};

setInterval(() => {
  const d = mqttStats.devices.size;
  if (d === 0 && mqttStats.statusPings === 0) return;
  console.log(
    `[MQTT] 1min: ${d} device(s) online, ${mqttStats.statusPings} pings, ` +
    `${mqttStats.configRequests} cfg-req, ${mqttStats.configPushes} cfg-push, ${mqttStats.configAcks} cfg-ack, ` +
    `${mqttStats.events} events, ${mqttStats.connections} connect, ${mqttStats.disconnections} disconnect` +
    (mqttStats.errors > 0 ? `, ${mqttStats.errors} errors` : '')
  );
  mqttStats.statusPings = 0;
  mqttStats.configRequests = 0;
  mqttStats.configPushes = 0;
  mqttStats.configAcks = 0;
  mqttStats.events = 0;
  mqttStats.connections = 0;
  mqttStats.disconnections = 0;
  mqttStats.errors = 0;
  mqttStats.devices.clear();
}, 60_000);

// Called when a device publishes to azul/{mac}/status
export async function handleDeviceStatus(mac: string, data: Record<string, unknown>) {
  mqttStats.statusPings++;
  mqttStats.devices.add(mac);

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

    if (!wasOnline) {
      mqttStats.connections++;
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
      mqttStats.errors++;
      console.error('[MQTT] handleDeviceStatus error:', err.message);
    }
  }
}

// Called when the broker delivers the LWT or an explicit online/offline message
export async function handleDeviceConnection(mac: string, data: Record<string, unknown>) {
  const online = data.online === true;
  if (!online) {
    mqttStats.disconnections++;
    recordDisconnect(mac);
    onlineDevices.delete(mac);
    sseRegistry.emit(mac, { type: 'connection', online: false });
    try {
      await db.device.updateMany({ where: { mac }, data: { online: false } });
    } catch { /* device may not be claimed */ }
  } else {
    mqttStats.connections++;
    recordPing(mac);
    sseRegistry.emit(mac, { type: 'connection', online: true });
  }
}

// Called when a device publishes to azul/{mac}/events
export async function handleDeviceEvent(mac: string, data: Record<string, unknown>) {
  mqttStats.events++;
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

  try {
    const device = await db.device.findUnique({ where: { mac } });
    if (!device) return;

    // Legacy audit log (zone_start only)
    if (type !== 'zone_stop') {
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
    }

    // Event log (all zone events)
    await logEvent(device.id, 'zone', type === 'zone_stop' ? 'zone_stop' : 'zone_start', {
      zone: zoneNumber, duration: durationSeconds, source,
    });
  } catch (err: any) {
    mqttStats.errors++;
    console.error('[MQTT] handleDeviceEvent error:', err.message);
  }
}

// Called when a device publishes to azul/{mac}/schedules — no-op, server is source of truth
export async function handleDeviceSchedules(_mac: string, _data: Record<string, unknown>) {}
