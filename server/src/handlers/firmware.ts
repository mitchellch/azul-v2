import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads/firmware');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

// Store uploads in a temp dir first — we move them into place after computing
// SHA-256 and validating the version isn't already taken.
const TMP_DIR = path.resolve(__dirname, '../../uploads/firmware/_tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (_req, _file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const firmwareRouter = Router();

// GET /api/admin/firmware — list releases, newest first.
// Open to any authenticated user so end-user apps can show "update available"
// without needing an M2M token. Read-only.
firmwareRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const releases = await db.firmwareRelease.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(releases);
  } catch (err) { next(err); }
});

const semver = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const UploadSchema = z.object({
  version:      z.string().regex(semver, 'version must be semver'),
  target:       z.string().min(1),
  releaseNotes: z.string().optional(),
});

// Firmware upload is a manufacturer operation — only M2M tokens (used by
// scripts/release-firmware.sh) can push new binaries. Prevents any authenticated
// end-user from seeding a malicious .bin into the release namespace.
function requireM2M(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.isM2M) return next(new HttpError(403, 'Firmware upload requires M2M credentials'));
  next();
}

// POST /api/admin/firmware — multipart upload (M2M only).
firmwareRouter.post('/', requireM2M, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded');

    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten().fieldErrors));
    const { version, target, releaseNotes } = parsed.data;

    // Bail early if the (version, target) pair is already registered.
    const dup = await db.firmwareRelease.findUnique({
      where: { version_target: { version, target } },
    });
    if (dup) throw new HttpError(409, `Release ${target}@${version} already exists`);

    // Compute SHA-256 of the uploaded temp file.
    const sha256 = await hashFile(req.file.path);
    const size   = req.file.size;

    // Move the temp file to its final location: uploads/firmware/<version>/<target>.bin
    const versionDir = path.join(UPLOADS_ROOT, version);
    fs.mkdirSync(versionDir, { recursive: true });
    const finalName = `${target}.bin`;
    const finalPath = path.join(versionDir, finalName);
    fs.renameSync(req.file.path, finalPath);

    const release = await db.firmwareRelease.create({
      data: {
        version,
        target,
        filePath: `${version}/${finalName}`,
        sha256,
        size,
        releaseNotes,
      },
    });

    res.status(201).json(release);
  } catch (err) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    next(err);
  }
});

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  (chunk) => hash.update(chunk));
    stream.on('end',   ()      => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
