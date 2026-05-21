import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { assertDeviceAccess } from '../lib/deviceAccess';

export const eventsRouter = Router();

// GET /api/devices/:mac/events?limit=50&offset=0&category=zone
eventsRouter.get('/:mac/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const limit    = Math.min(parseInt((req.query.limit as string) ?? '50'), 256);
    const offset   = parseInt((req.query.offset as string) ?? '0');
    const category = req.query.category as string | undefined;

    const where: any = { deviceId: device.id };
    if (category) where.category = category;

    const events = await db.eventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    res.json(events);
  } catch (err) { next(err); }
});
