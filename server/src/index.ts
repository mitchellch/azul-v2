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

// Behind a reverse proxy (Caddy now; Caddy + Cloudflare after the P7 perimeter
// forward). Trust the proxy hop(s) so req.ip is the real client rather than the
// proxy — required for correct rate-limiting and access logs. Bump
// TRUST_PROXY_HOPS to 2 in .env once Cloudflare fronts the origin
// (Cloudflare → Caddy → app).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());

// Lightweight request logger — one line per API call.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

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
