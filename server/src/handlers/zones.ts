import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { assertDeviceAccess } from '../lib/deviceAccess';
import { HttpError } from '../middleware/errorHandler';

export const zonesRouter = Router();

// GET /api/devices/:mac/zones
zonesRouter.get('/:mac/zones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const zones  = await db.zone.findMany({
      where:   { deviceId: device.id },
      orderBy: { number: 'asc' },
    });
    res.json(zones);
  } catch (err) { next(err); }
});

// PUT /api/devices/:mac/zones/:zoneNumber — rename a zone
zonesRouter.put('/:mac/zones/:zoneNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device     = await assertDeviceAccess(req.params.mac, req.user!.id);
    const zoneNumber = parseInt(req.params.zoneNumber, 10);
    if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) throw new HttpError(400, 'Invalid zone number');

    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'name required');

    const zone = await db.zone.upsert({
      where:  { deviceId_number: { deviceId: device.id, number: zoneNumber } },
      update: { name: name.trim() },
      create: { deviceId: device.id, number: zoneNumber, name: name.trim() },
    });
    res.json(zone);
  } catch (err) { next(err); }
});
