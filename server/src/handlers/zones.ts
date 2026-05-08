import { Router, Request, Response } from 'express';
import { db } from '../db/client';

export const zonesRouter = Router();

// GET /api/devices/:mac/zones
zonesRouter.get('/:mac/zones', async (req: Request, res: Response) => {
  const device = await db.device.findUnique({ where: { mac: req.params.mac } });
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const zones = await db.zone.findMany({
    where:   { deviceId: device.id },
    orderBy: { number: 'asc' },
  });
  return res.json(zones);
});

// PUT /api/devices/:mac/zones/:zoneId — rename a zone
zonesRouter.put('/:mac/zones/:zoneId', async (req: Request, res: Response) => {
  const device = await db.device.findUnique({ where: { mac: req.params.mac } });
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const zone = await db.zone.upsert({
    where:  { deviceId_number: { deviceId: device.id, number: parseInt(req.params.zoneId) } },
    update: { name: req.body.name },
    create: { deviceId: device.id, number: parseInt(req.params.zoneId), name: req.body.name },
  });
  return res.json(zone);
});
