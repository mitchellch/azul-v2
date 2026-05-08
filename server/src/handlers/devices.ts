import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { mqttClient } from '../mqtt/client';
import { z } from 'zod';

export const devicesRouter = Router();

// GET /api/devices — list all devices (no auth yet for dev)
devicesRouter.get('/', async (_req: Request, res: Response) => {
  const devices = await db.device.findMany({
    orderBy: { lastSeenAt: 'desc' },
    include: { zones: true },
  });
  res.json(devices);
});

// GET /api/devices/:mac — get single device
devicesRouter.get('/:mac', async (req: Request, res: Response) => {
  const device = await db.device.findUnique({
    where:   { mac: req.params.mac },
    include: { zones: true },
  });
  if (!device) return res.status(404).json({ error: 'Device not found' });
  return res.json(device);
});

// POST /api/devices — register a device
const RegisterSchema = z.object({
  mac:  z.string(),
  name: z.string().optional(),
});

devicesRouter.post('/', async (req: Request, res: Response) => {
  const body = RegisterSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const device = await db.device.upsert({
    where:  { mac: body.data.mac },
    update: { name: body.data.name ?? undefined },
    create: {
      mac:  body.data.mac,
      name: body.data.name ?? `Azul Controller (${body.data.mac.slice(-8)})`,
      // TODO: associate with authenticated user
      user: { connectOrCreate: {
        where:  { auth0Sub: 'dev-user' },
        create: { auth0Sub: 'dev-user', email: 'dev@azul.local', name: 'Dev User' },
      }},
    },
  });
  return res.status(201).json(device);
});

// POST /api/devices/:mac/zones/:zoneId/start
devicesRouter.post('/:mac/zones/:zoneId/start', async (req: Request, res: Response) => {
  const { mac, zoneId } = req.params;
  const duration = (req.body.duration as number) ?? 60;

  mqttClient.publish(mac, 'zone/start', { zone: parseInt(zoneId), duration });
  return res.json({ ok: true });
});

// POST /api/devices/:mac/zones/stop-all
devicesRouter.post('/:mac/zones/stop-all', async (req: Request, res: Response) => {
  mqttClient.publish(req.params.mac, 'zone/stop-all', {});
  return res.json({ ok: true });
});
