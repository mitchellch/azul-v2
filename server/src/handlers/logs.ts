import { Router, Request, Response } from 'express';
import { db } from '../db/client';

export const logsRouter = Router();

// GET /api/devices/:mac/log
logsRouter.get('/:mac/log', async (req: Request, res: Response) => {
  const device = await db.device.findUnique({ where: { mac: req.params.mac } });
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const limit = parseInt((req.query.limit as string) ?? '50');
  const logs = await db.auditLog.findMany({
    where:   { deviceId: device.id },
    orderBy: { startedAt: 'desc' },
    take:    limit,
  });
  return res.json(logs);
});
