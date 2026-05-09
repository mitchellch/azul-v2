import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './router';
import { mqttClient } from './mqtt/client';
import { errorHandler } from './middleware/errorHandler';
import { startOfflineSweep } from './jobs/offlineSweep';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Public health check — no auth required
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/api', router);

// Centralized error handler — must be last
app.use(errorHandler);

mqttClient.connect();
startOfflineSweep();

app.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
});
