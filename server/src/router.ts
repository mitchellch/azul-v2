import { Router } from 'express';
import { jwtMiddleware } from './middleware/auth';
import { requireUser } from './middleware/requireUser';
import { devicesRouter } from './handlers/devices';
import { zonesRouter } from './handlers/zones';
import { logsRouter } from './handlers/logs';
import { schedulesRouter } from './handlers/schedules';

export const router = Router();

// All /api routes require a valid JWT and a resolved user
router.use(jwtMiddleware);
router.use(requireUser);

router.use('/devices', devicesRouter);
router.use('/devices', zonesRouter);
router.use('/devices', logsRouter);
router.use('/devices/:mac/schedules', schedulesRouter);
