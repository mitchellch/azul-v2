import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { mqttClient } from '../mqtt/client';
import { assertDeviceAccess } from '../lib/deviceAccess';
import { toPayload } from '../lib/scheduleSerializer';
import { HttpError } from '../middleware/errorHandler';
import { z } from 'zod';

export const schedulesRouter = Router({ mergeParams: true });

const RunSchema = z.object({
  zone_id:          z.number().int().min(1).max(8),
  day_mask:         z.number().int().min(0).max(127),
  hour:             z.number().int().min(0).max(23),
  minute:           z.number().int().min(0).max(59),
  duration_seconds: z.number().int().min(1),
  interval_days:    z.number().int().min(1).optional(),
});

const ScheduleSchema = z.object({
  name:       z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  runs:       z.array(RunSchema).min(1),
});

function datesOverlap(start1: string, end1: string | null, start2: string, end2: string | null): boolean {
  const s1 = new Date(start1);
  const e1 = end1 ? new Date(end1) : new Date('9999-12-31');
  const s2 = new Date(start2);
  const e2 = end2 ? new Date(end2) : new Date('9999-12-31');
  return !(e1 < s2 || s1 > e2);
}

async function checkOverlapWithExisting(deviceId: string, startDate: string, endDate: string | null, excludeUuid?: string): Promise<boolean> {
  const existing = await db.schedule.findMany({
    where: { deviceId, ...(excludeUuid && { uuid: { not: excludeUuid } }) },
    select: { startDate: true, endDate: true },
  });
  return existing.some(s => datesOverlap(startDate, endDate, s.startDate, s.endDate));
}

async function getFullSchedule(uuid: string) {
  return db.schedule.findUnique({ where: { uuid }, include: { runs: true } });
}

// GET /api/devices/:mac/schedules
schedulesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const schedules = await db.schedule.findMany({
      where:   { deviceId: device.id },
      include: { runs: true },
      orderBy: { startDate: 'asc' },
    });
    res.json(schedules.map(toPayload));
  } catch (err) { next(err); }
});

// GET /api/devices/:mac/schedules/active
schedulesRouter.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const schedule = await db.schedule.findFirst({
      where:   { deviceId: device.id, active: true },
      include: { runs: true },
    });
    if (!schedule) return res.status(404).json({ error: 'No active schedule' });
    return res.json(toPayload(schedule));
  } catch (err) { next(err); }
});

// GET /api/devices/:mac/schedules/:uuid
schedulesRouter.get('/:uuid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const schedule = await db.schedule.findFirst({
      where:   { uuid: req.params.uuid, deviceId: device.id },
      include: { runs: true },
    });
    if (!schedule) throw new HttpError(404, 'Schedule not found');
    res.json(toPayload(schedule));
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/schedules
schedulesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const body = ScheduleSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));

    const { name, start_date, end_date, runs } = body.data;

    if (await checkOverlapWithExisting(device.id, start_date, end_date ?? null)) {
      throw new HttpError(409, 'Date range overlaps existing schedule');
    }

    const uuid = randomUUID();
    const schedule = await db.schedule.create({
      data: {
        deviceId:  device.id,
        uuid,
        name,
        startDate: start_date,
        endDate:   end_date ?? null,
        runs: {
          create: runs.map(r => ({
            zoneNumber:      r.zone_id,
            dayMask:         r.day_mask,
            hour:            r.hour,
            minute:          r.minute,
            durationSeconds: r.duration_seconds,
            intervalDays:    r.interval_days ?? 1,
          })),
        },
      },
      include: { runs: true },
    });

    mqttClient.publish(req.params.mac, 'schedule/set', toPayload(schedule));
    res.status(201).json(toPayload(schedule));
  } catch (err) { next(err); }
});

// PUT /api/devices/:mac/schedules/:uuid
schedulesRouter.put('/:uuid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const body = ScheduleSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));

    const existing = await db.schedule.findFirst({ where: { uuid: req.params.uuid, deviceId: device.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found');

    const { name, start_date, end_date, runs } = body.data;

    if (await checkOverlapWithExisting(device.id, start_date, end_date ?? null, req.params.uuid)) {
      throw new HttpError(409, 'Date range overlaps existing schedule');
    }

    // Recreate runs (simpler than diffing)
    await db.scheduleRun.deleteMany({ where: { scheduleId: existing.id } });
    const schedule = await db.schedule.update({
      where: { id: existing.id },
      data: {
        name,
        startDate: start_date,
        endDate:   end_date ?? null,
        runs: {
          create: runs.map(r => ({
            zoneNumber:      r.zone_id,
            dayMask:         r.day_mask,
            hour:            r.hour,
            minute:          r.minute,
            durationSeconds: r.duration_seconds,
            intervalDays:    r.interval_days ?? 1,
          })),
        },
      },
      include: { runs: true },
    });

    mqttClient.publish(req.params.mac, 'schedule/set', toPayload(schedule));
    res.json(toPayload(schedule));
  } catch (err) { next(err); }
});

// DELETE /api/devices/:mac/schedules/:uuid
schedulesRouter.delete('/:uuid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const existing = await db.schedule.findFirst({ where: { uuid: req.params.uuid, deviceId: device.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found');

    await db.schedule.delete({ where: { id: existing.id } });
    mqttClient.publish(req.params.mac, 'schedule/delete', { uuid: req.params.uuid });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

