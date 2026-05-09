import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { assertDeviceAccess } from '../lib/deviceAccess';

export const logsRouter = Router();

// GET /api/devices/:mac/log?limit=50&offset=0
logsRouter.get('/:mac/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await assertDeviceAccess(req.params.mac, req.user!.id);
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? '50'),  256);
    const offset = parseInt((req.query.offset as string) ?? '0');

    const logs = await db.auditLog.findMany({
      where:   { deviceId: device.id },
      orderBy: { startedAt: 'desc' },
      take:    limit,
      skip:    offset,
      include: { zone: { select: { number: true, name: true } } },
    });
    res.json(logs);
  } catch (err) { next(err); }
});
