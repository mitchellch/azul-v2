import { Router } from 'express';
import { jwtMiddleware } from './middleware/auth';
import { requireUser } from './middleware/requireUser';
import { devicesRouter } from './handlers/devices';
import { zonesRouter } from './handlers/zones';
import { logsRouter } from './handlers/logs';
import { eventsRouter } from './handlers/events';
import { schedulesRouter } from './handlers/schedules';
import { orgsRouter } from './handlers/orgs';
import { firmwareRouter } from './handlers/firmware';

export const router = Router();

// All /api routes require a valid JWT and a resolved user
router.use(jwtMiddleware);
router.use(requireUser);

router.use('/devices', devicesRouter);
router.use('/devices', zonesRouter);
router.use('/devices', logsRouter);
router.use('/devices', eventsRouter);
router.use('/devices/:mac/schedules', schedulesRouter);
router.use('/orgs', orgsRouter);
router.use('/admin/firmware', firmwareRouter);
