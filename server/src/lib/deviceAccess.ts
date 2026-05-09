import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';

export async function assertDeviceOwner(mac: string, userId: string) {
  const device = await db.device.findUnique({ where: { mac } });
  if (!device)              throw new HttpError(404, 'Device not found');
  if (device.userId !== userId) throw new HttpError(403, 'Forbidden');
  return device;
}
