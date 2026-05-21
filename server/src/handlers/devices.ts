import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { mqttClient } from '../mqtt/client';
import { assertDeviceAccess } from '../lib/deviceAccess';
import { sseRegistry } from '../lib/sseRegistry';
import { HttpError } from '../middleware/errorHandler';
import { getConnectionStatus } from '../lib/connectionMonitor';
import { zoneStateCache } from '../lib/zoneStateCache';
import { logEvent } from '../lib/eventLog';
import { z } from 'zod';

export const devicesRouter = Router();

// GET /api/devices — list devices owned by the authenticated user
devicesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where = req.user!.isM2M ? {} : { userId: req.user!.id };
    const devices = await db.device.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      include: { zones: { orderBy: { number: 'asc' } }, schedules: { where: { active: true }, select: { uuid: true } } },
    });
    res.json(devices.map(d => ({
      ...d,
      hasActiveSchedule: d.schedules.length > 0,
      activeScheduleUuid: d.schedules[0]?.uuid ?? null,
      schedules: undefined,
    })));
  } catch (err) { next(err); }
});

// GET /api/devices/stream — SSE for ALL user devices (must be before /:mac to avoid shadowing)
devicesRouter.get('/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await db.device.findMany({
      where:   { userId: req.user!.id },
      include: { zones: { orderBy: { number: 'asc' } } },
    });

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for (const device of devices) {
      const liveZones = zoneStateCache.get(device.mac);
      if (liveZones.length > 0) {
        const liveMap = new Map(liveZones.map(z => [z.id, z]));
        device.zones = device.zones.map(z => {
          const live = liveMap.get(z.number);
          if (!live) return z;
          return { ...z, status: live.status, runtime_seconds: live.runtime } as any;
        });
      }
      res.write(`data: ${JSON.stringify({ type: 'snapshot', mac: device.mac, device })}\n\n`);
    }

    const unsubs = devices.map(d =>
      sseRegistry.subscribe(d.mac, (event) => {
        res.write(`data: ${JSON.stringify({ ...event, mac: d.mac })}\n\n`);
      })
    );

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);
    req.on('close', () => { unsubs.forEach(u => u()); clearInterval(heartbeat); });
  } catch (err) { next(err); }
});

// GET /api/devices/:mac — get single device (must be owned by user)
devicesRouter.get('/:mac', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const full = await db.device.findUnique({
      where:   { mac: req.params.mac },
      include: { zones: { orderBy: { number: 'asc' } }, schedules: { include: { runs: true } } },
    });
    if (!full) { next(new HttpError(404, 'Device not found')); return; }

    // Merge live zone state from MQTT cache
    const liveZones = zoneStateCache.get(req.params.mac);
    if (liveZones.length > 0) {
      const liveMap = new Map(liveZones.map(z => [z.id, z]));
      full.zones = full.zones.map(z => {
        const live = liveMap.get(z.number);
        if (!live) return z;
        return { ...z, status: live.status, runtime_seconds: live.runtime, source: live.source } as any;
      });
    }

    res.json(full);
  } catch (err) { next(err); }
});

// POST /api/devices/claim — associate user with a device after BLE adoption
const ClaimSchema = z.object({
  mac:  z.string().min(1),
  name: z.string().optional(),
});

devicesRouter.post('/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ClaimSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.flatten().fieldErrors.mac?.[0] ?? 'Invalid request');

    const { mac, name } = body.data;
    const userId = req.user!.id;

    // Check if already claimed
    const existing = await db.device.findUnique({ where: { mac } });
    if (existing) {
      if (existing.userId === userId) {
        // Idempotent — already owned by this user
        if (name) await db.device.update({ where: { mac }, data: { name } });
        return res.json(await db.device.findUnique({ where: { mac }, include: { zones: { orderBy: { number: 'asc' } } } }));
      }
      throw new HttpError(409, 'Device is already claimed by another account');
    }

    // Create device, promoting from pending_devices if present, in a transaction
    const device = await db.$transaction(async (tx) => {
      const d = await tx.device.create({
        data: {
          mac,
          name: name ?? `Azul Controller (${mac.slice(-8)})`,
          userId,
        },
      });

      // Auto-create 8 zones
      await tx.zone.createMany({
        data: Array.from({ length: 8 }, (_, i) => ({
          deviceId: d.id,
          number: i + 1,
        })),
      });

      // Remove from pending_devices if it was there
      await tx.pendingDevice.deleteMany({ where: { mac } });

      return d;
    });

    const full = await db.device.findUnique({
      where:   { mac },
      include: { zones: { orderBy: { number: 'asc' } } },
    });
    return res.status(201).json(full);
  } catch (err) { next(err); }
});

// PATCH /api/devices/:mac — update device name
devicesRouter.patch('/:mac', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'name required');
    const device = await db.device.update({ where: { mac: req.params.mac }, data: { name: name.trim() } });
    logEvent(device.id, 'config', 'device_rename', { name: name.trim() });
    res.json(device);
  } catch (err) { next(err); }
});

// DELETE /api/devices/:mac — unclaim device
devicesRouter.delete('/:mac', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    await db.device.delete({ where: { mac: req.params.mac } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/zones/:zoneNumber/start
devicesRouter.post('/:mac/zones/:zoneNumber/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const zoneNumber = parseInt(req.params.zoneNumber, 10);
    const duration   = (req.body.duration as number) ?? 60;
    if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) throw new HttpError(400, 'Invalid zone number');
    const anyRunning = zoneStateCache.get(req.params.mac).some(z => z.status === 'running');
    zoneStateCache.patch(req.params.mac, zoneNumber, { status: anyRunning ? 'pending' : 'running', runtime: duration, source: 'REST' });
    sseRegistry.emit(req.params.mac, { type: 'status', zones: zoneStateCache.get(req.params.mac).map(z => ({ id: z.id, status: z.status, runtime_seconds: z.runtime, source: z.source })) });
    mqttClient.publish(req.params.mac, 'zone/start', { zone: zoneNumber, duration });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/zones/:zoneNumber/stop
devicesRouter.post('/:mac/zones/:zoneNumber/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const zoneNumber = parseInt(req.params.zoneNumber, 10);
    zoneStateCache.patch(req.params.mac, zoneNumber, { status: 'idle', runtime: 0, source: undefined });
    sseRegistry.emit(req.params.mac, { type: 'status', zones: zoneStateCache.get(req.params.mac).map(z => ({ id: z.id, status: z.status, runtime_seconds: z.runtime, source: z.source })) });
    mqttClient.publish(req.params.mac, 'zone/stop', { zone: zoneNumber });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/devices/:mac/connection-status — MQTT connection health grade
devicesRouter.get('/:mac/connection-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const status = getConnectionStatus(req.params.mac);
    res.json({ mac: req.params.mac, ...status });
  } catch (err) { next(err); }
});

// GET /api/devices/:mac/stream — single-device SSE (kept for compatibility)
devicesRouter.get('/:mac/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const full = await db.device.findUnique({
      where:   { mac: req.params.mac },
      include: { zones: { orderBy: { number: 'asc' } } },
    });
    if (full) {
      const liveZones = zoneStateCache.get(req.params.mac);
      if (liveZones.length > 0) {
        const liveMap = new Map(liveZones.map(z => [z.id, z]));
        full.zones = full.zones.map(z => {
          const live = liveMap.get(z.number);
          if (!live) return z;
          return { ...z, status: live.status, runtime_seconds: live.runtime, source: live.source } as any;
        });
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'snapshot', mac: req.params.mac, device: full })}\n\n`);

    const unsubscribe = sseRegistry.subscribe(req.params.mac, (event) => {
      res.write(`data: ${JSON.stringify({ ...event, mac: req.params.mac })}\n\n`);
    });

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  } catch (err) { next(err); }
});

// POST /api/devices/:mac/zones/stop-all
devicesRouter.post('/:mac/zones/stop-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertDeviceAccess(req.params.mac, req.user!.id);
    const cached = zoneStateCache.get(req.params.mac);
    for (const z of cached) zoneStateCache.patch(req.params.mac, z.id, { status: 'idle', runtime: 0, source: undefined });
    sseRegistry.emit(req.params.mac, { type: 'status', zones: zoneStateCache.get(req.params.mac).map(z => ({ id: z.id, status: z.status, runtime_seconds: z.runtime, source: z.source })) });
    mqttClient.publish(req.params.mac, 'zone/stop-all', {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const AssignDeviceOrgSchema = z.object({ orgId: z.string().uuid() });

// PUT /api/devices/:mac/org
devicesRouter.put('/:mac/org', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { mac } = req.params;

    const body = AssignDeviceOrgSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));

    const { orgId } = body.data;

    const device = await db.device.findUnique({ where: { mac } });
    if (!device) throw new HttpError(404, 'Device not found');
    if (device.userId !== userId) throw new HttpError(403, 'Forbidden');

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!member) throw new HttpError(403, 'Not a member of that organization');

    const updated = await db.device.update({ where: { mac }, data: { orgId } });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/devices/:mac/org
devicesRouter.delete('/:mac/org', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { mac } = req.params;

    const device = await db.device.findUnique({ where: { mac } });
    if (!device) throw new HttpError(404, 'Device not found');
    if (device.userId !== userId) throw new HttpError(403, 'Forbidden');

    const updated = await db.device.update({ where: { mac }, data: { orgId: null } });
    res.json(updated);
  } catch (err) { next(err); }
});
