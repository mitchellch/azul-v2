import { Router } from 'express';
import { devicesRouter } from './handlers/devices';
import { zonesRouter } from './handlers/zones';
import { logsRouter } from './handlers/logs';

export const router = Router();

router.use('/devices', devicesRouter);
router.use('/devices', zonesRouter);
router.use('/devices', logsRouter);
