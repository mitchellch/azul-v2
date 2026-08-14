import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './router';
import { mqttClient } from './mqtt/client';
import { errorHandler } from './middleware/errorHandler';
import { startOfflineSweep } from './jobs/offlineSweep';
import { startOtaStallSweep } from './jobs/otaStallSweep';
import { ensureZones } from './lib/ensureZones';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());

// Serve uploaded zone photos
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Serve firmware binaries — controllers download from here after receiving
// an ota/update MQTT command with a URL pointing at this route.
app.use('/firmware', express.static(path.resolve(__dirname, '../uploads/firmware')));

// Public health check — no auth required
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/api', router);

// Centralized error handler — must be last
app.use(errorHandler);

mqttClient.connect();
startOfflineSweep();
startOtaStallSweep();
ensureZones().catch(e => console.error('[ensureZones]', e));

app.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  console.log(`[Server] Mode: ${process.env.DEBUG_MODE === 'true' ? 'DEBUG' : 'PRODUCTION'}`);
});
