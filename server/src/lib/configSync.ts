import { db } from '../db/client';
import { mqttClient } from '../mqtt/client';
import { toPayload } from './scheduleSerializer';

export type ConfigBlob = {
  version: number;
  name: string;
  zones: {
    number: number;
    name: string;
    color: string | null;
    enabled: boolean;
  }[];
  schedules: {
    uuid: string;
    name: string;
    active: boolean;
    start_date: string;
    end_date: string | null;
    runs: {
      zone_id: number;
      day_mask: number;
      hour: number;
      minute: number;
      duration_seconds: number;
      interval_days?: number;
    }[];
  }[];
  settings: Record<string, unknown>;
};

export async function buildConfigBlob(deviceId: string): Promise<ConfigBlob> {
  const device = await db.device.findUniqueOrThrow({
    where: { id: deviceId },
    include: {
      zones: { orderBy: { number: 'asc' } },
      schedules: { include: { runs: true } },
    },
  });

  return {
    version: device.configVersion,
    name: device.name,
    zones: device.zones.map(z => ({
      number: z.number,
      name: z.name,
      color: z.color,
      enabled: true,
    })),
    schedules: device.schedules.map(s => ({
      ...toPayload(s),
    })),
    settings: {},
  };
}

export async function bumpConfigVersion(deviceId: string): Promise<number> {
  const device = await db.device.update({
    where: { id: deviceId },
    data: { configVersion: { increment: 1 } },
  });
  return device.configVersion;
}

export async function bumpAndPushConfig(mac: string, deviceId: string): Promise<void> {
  await bumpConfigVersion(deviceId);
  const config = await buildConfigBlob(deviceId);
  mqttClient.publish(mac, 'config/push', config);
}

export async function handleConfigRequest(mac: string, data: Record<string, unknown>): Promise<void> {
  const requestedVersion = (data.version as number) ?? 0;

  const device = await db.device.findUnique({ where: { mac } });
  if (!device) return;

  if (device.configVersion === requestedVersion) {
    mqttClient.publish(mac, 'config/ack', { upToDate: true, version: device.configVersion });
  } else {
    const config = await buildConfigBlob(device.id);
    mqttClient.publish(mac, 'config/push', config);
  }
}

export async function handleConfigAck(mac: string, data: Record<string, unknown>): Promise<void> {
  const ackedVersion = data.version as number;
  if (typeof ackedVersion !== 'number') return;

  await db.device.updateMany({
    where: { mac },
    data: { lastConfigAck: ackedVersion },
  });
}
