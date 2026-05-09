import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';

export async function assertDeviceAccess(mac: string, userId: string, orgId?: string) {
  const device = await db.device.findUnique({ where: { mac } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (device.userId === userId) return device;
  if (device.orgId && orgId && device.orgId === orgId) {
    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (member) return device;
  }
  throw new HttpError(403, 'Forbidden');
}
