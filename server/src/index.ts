import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './router';
import { mqttClient } from './mqtt/client';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', router);

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Start MQTT client
mqttClient.connect();

app.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
});
