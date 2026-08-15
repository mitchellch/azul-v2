import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';
import { assertDeviceAccess } from '../lib/deviceAccess';
import { logEvent } from '../lib/eventLog';
import { MAX_ZONES } from '../lib/constants';
import { syncCompiledProgramsToFirmware } from '../lib/programCompiler';

export const programsRouter = Router({ mergeParams: true });

// -------- Zod --------------------------------------------------------------

const StartTimeSchema = z.object({
  hour:   z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const ProgramZoneSchema = z.object({
  zoneNumber:      z.number().int().min(1).max(MAX_ZONES),
  durationSeconds: z.number().int().min(1),
  order:           z.number().int().min(0),
});

const ProgramSchema = z.object({
  name:         z.string().min(1),
  dayMask:      z.number().int().min(0).max(127),
  intervalDays: z.number().int().min(1).max(30).optional(),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active:       z.boolean().optional(),
  startTimes:   z.array(StartTimeSchema).min(1).max(6),
  zones:        z.array(ProgramZoneSchema).min(1),
});

// -------- Serialization ----------------------------------------------------

type ProgramWithChildren = Awaited<ReturnType<typeof loadProgram>>;

async function loadProgram(id: string) {
  return db.program.findUnique({
    where:   { id },
    include: {
      startTimes: { orderBy: { hour: 'asc' } },
      zones:      { orderBy: { order: 'asc' } },
    },
  });
}

function toPayload(p: NonNullable<ProgramWithChildren>) {
  return {
    id:           p.id,
    name:         p.name,
    dayMask:      p.dayMask,
    intervalDays: p.intervalDays,
    startDate:    p.startDate,
    endDate:      p.endDate,
    active:       p.active,
    startTimes:   p.startTimes.map(s => ({ hour: s.hour, minute: s.minute })),
    zones:        p.zones.map(z => ({
      zoneNumber:      z.zoneNumber,
      durationSeconds: z.durationSeconds,
      order:           z.order,
    })),
  };
}

// Today's date in server-local YYYY-MM-DD. Programs' startDate is a wall-clock
// value (no timezone), matching Schedule.startDate.
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// -------- Routes -----------------------------------------------------------

// GET /api/devices/:mac/programs
programsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const programs = await db.program.findMany({
      where:   { deviceId: device.id },
      include: {
        startTimes: { orderBy: { hour: 'asc' } },
        zones:      { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(programs.map(toPayload));
  } catch (err) { next(err); }
});

// GET /api/devices/:mac/programs/:id
programsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const program = await loadProgram(req.params.id);
    if (!program || program.deviceId !== device.id) throw new HttpError(404, 'Program not found');
    res.json(toPayload(program));
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/programs
programsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const body = ProgramSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));
    const { name, dayMask, intervalDays, startDate, endDate, active, startTimes, zones } = body.data;

    const created = await db.program.create({
      data: {
        deviceId:     device.id,
        name,
        dayMask,
        intervalDays: intervalDays ?? 1,
        startDate:    startDate ?? todayLocal(),
        endDate:      endDate ?? null,
        active:       active ?? false,
        startTimes:   { create: startTimes.map(s => ({ hour: s.hour, minute: s.minute })) },
        zones:        { create: zones.map(z => ({ zoneNumber: z.zoneNumber, durationSeconds: z.durationSeconds, order: z.order })) },
      },
      include: {
        startTimes: { orderBy: { hour: 'asc' } },
        zones:      { orderBy: { order: 'asc' } },
      },
    });

    if (created.active) {
      await syncCompiledProgramsToFirmware(device.mac, device.id);
    }
    logEvent(device.id, 'schedule', 'schedule_create', { programId: created.id, name });

    res.status(201).json(toPayload(created));
  } catch (err) { next(err); }
});

// PUT /api/devices/:mac/programs/:id
programsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const existing = await db.program.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deviceId !== device.id) throw new HttpError(404, 'Program not found');

    const body = ProgramSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));
    const { name, dayMask, intervalDays, startDate, endDate, active, startTimes, zones } = body.data;

    // Recreate children rather than diff — simpler and matches Schedule handler pattern.
    await db.$transaction([
      db.programStartTime.deleteMany({ where: { programId: existing.id } }),
      db.programZone.deleteMany({ where: { programId: existing.id } }),
      db.program.update({
        where: { id: existing.id },
        data: {
          name,
          dayMask,
          intervalDays: intervalDays ?? 1,
          startDate:    startDate ?? existing.startDate,
          endDate:      endDate === undefined ? existing.endDate : endDate,
          active:       active ?? existing.active,
          startTimes:   { create: startTimes.map(s => ({ hour: s.hour, minute: s.minute })) },
          zones:        { create: zones.map(z => ({ zoneNumber: z.zoneNumber, durationSeconds: z.durationSeconds, order: z.order })) },
        },
      }),
    ]);

    const updated = await loadProgram(existing.id);

    // Sync if this program is (or was) affecting active state — cheap to always sync on edit.
    await syncCompiledProgramsToFirmware(device.mac, device.id);
    logEvent(device.id, 'schedule', 'schedule_update', { programId: existing.id, name });

    res.json(toPayload(updated!));
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/programs/:id/activate
programsRouter.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const program = await db.program.findUnique({ where: { id: req.params.id } });
    if (!program || program.deviceId !== device.id) throw new HttpError(404, 'Program not found');

    await db.program.update({ where: { id: program.id }, data: { active: true } });
    await syncCompiledProgramsToFirmware(device.mac, device.id);
    logEvent(device.id, 'schedule', 'schedule_activate', { programId: program.id, name: program.name });

    const refreshed = await loadProgram(program.id);
    res.json(toPayload(refreshed!));
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/programs/:id/deactivate
programsRouter.post('/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const program = await db.program.findUnique({ where: { id: req.params.id } });
    if (!program || program.deviceId !== device.id) throw new HttpError(404, 'Program not found');

    await db.program.update({ where: { id: program.id }, data: { active: false } });
    await syncCompiledProgramsToFirmware(device.mac, device.id);
    logEvent(device.id, 'schedule', 'schedule_deactivate', { programId: program.id, name: program.name });

    const refreshed = await loadProgram(program.id);
    res.json(toPayload(refreshed!));
  } catch (err) { next(err); }
});

// DELETE /api/devices/:mac/programs/:id
programsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const program = await db.program.findUnique({ where: { id: req.params.id } });
    if (!program || program.deviceId !== device.id) throw new HttpError(404, 'Program not found');

    await db.program.delete({ where: { id: program.id } });
    await syncCompiledProgramsToFirmware(device.mac, device.id);
    logEvent(device.id, 'schedule', 'schedule_delete', { programId: program.id, name: program.name });

    res.json({ ok: true });
  } catch (err) { next(err); }
});
