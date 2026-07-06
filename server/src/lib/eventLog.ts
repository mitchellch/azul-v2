import { db } from '../db/client';

export type EventCategory = 'zone' | 'schedule' | 'config' | 'system';

export type EventAction =
  | 'zone_start' | 'zone_stop'
  | 'schedule_create' | 'schedule_update' | 'schedule_delete'
  | 'schedule_activate' | 'schedule_deactivate'
  | 'zone_rename' | 'zone_color' | 'device_rename' | 'zone_photo_set' | 'zone_photo_remove'
  | 'error';

export async function logEvent(
  deviceId: string,
  category: EventCategory,
  action: EventAction,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.eventLog.create({
      data: { deviceId, category, action, metadata: (metadata ?? null) as any },
    });
  } catch (err: any) {
    console.error('[eventLog] write failed:', err.message);
  }
}
