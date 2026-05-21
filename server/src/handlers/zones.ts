import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/client';
import { assertDeviceAccess } from '../lib/deviceAccess';
import { logEvent } from '../lib/eventLog';
import { HttpError } from '../middleware/errorHandler';

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/zones');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

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
    logEvent(device.id, 'config', 'zone_rename', { zone: zoneNumber, name: name.trim() });
    res.json(zone);
  } catch (err) { next(err); }
});

// PUT /api/devices/:mac/zones/:zoneNumber/photo — upload zone photo
zonesRouter.put('/:mac/zones/:zoneNumber/photo', upload.single('photo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device     = await assertDeviceAccess(req.params.mac, req.user!.id);
    const zoneNumber = parseInt(req.params.zoneNumber, 10);
    if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) throw new HttpError(400, 'Invalid zone number');
    if (!req.file) throw new HttpError(400, 'No photo uploaded');

    const photoUrl = `/uploads/zones/${req.file.filename}`;

    // Delete old photo file if exists
    const existing = await db.zone.findUnique({
      where: { deviceId_number: { deviceId: device.id, number: zoneNumber } },
    });
    if (existing?.photoUrl) {
      const oldPath = path.resolve(__dirname, '../..', existing.photoUrl.replace(/^\//, ''));
      fs.unlink(oldPath, () => {});
    }

    const zone = await db.zone.upsert({
      where:  { deviceId_number: { deviceId: device.id, number: zoneNumber } },
      update: { photoUrl },
      create: { deviceId: device.id, number: zoneNumber, photoUrl },
    });
    logEvent(device.id, 'config', 'zone_photo_set', { zone: zoneNumber });
    res.json(zone);
  } catch (err) { next(err); }
});

// DELETE /api/devices/:mac/zones/:zoneNumber/photo — remove zone photo
zonesRouter.delete('/:mac/zones/:zoneNumber/photo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device     = await assertDeviceAccess(req.params.mac, req.user!.id);
    const zoneNumber = parseInt(req.params.zoneNumber, 10);
    if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) throw new HttpError(400, 'Invalid zone number');

    const existing = await db.zone.findUnique({
      where: { deviceId_number: { deviceId: device.id, number: zoneNumber } },
    });
    if (existing?.photoUrl) {
      const oldPath = path.resolve(__dirname, '../..', existing.photoUrl.replace(/^\//, ''));
      fs.unlink(oldPath, () => {});
      await db.zone.update({
        where: { deviceId_number: { deviceId: device.id, number: zoneNumber } },
        data:  { photoUrl: null },
      });
      logEvent(device.id, 'config', 'zone_photo_remove', { zone: zoneNumber });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});
