import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';
import { z } from 'zod';

export const orgsRouter = Router();

const CreateOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['admin', 'member']),
});

// POST /api/orgs
orgsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateOrgSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));

    const { name, slug } = body.data;
    const userId = req.user!.id;

    const existing = await db.organization.findUnique({ where: { slug } });
    if (existing) throw new HttpError(409, 'Slug already taken');

    const org = await db.$transaction(async (tx) => {
      const o = await tx.organization.create({ data: { name, slug, ownerId: userId } });
      await tx.orgMember.create({ data: { orgId: o.id, userId, role: 'admin' } });
      return o;
    });

    res.status(201).json(org);
  } catch (err) { next(err); }
});

// GET /api/orgs
orgsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const memberships = await db.orgMember.findMany({
      where:   { userId },
      include: { org: true },
    });
    res.json(memberships.map((m) => ({ ...m.org, role: m.role })));
  } catch (err) { next(err); }
});

// GET /api/orgs/:orgId
orgsRouter.get('/:orgId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { orgId } = req.params;

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!member) throw new HttpError(403, 'Forbidden');

    const org = await db.organization.findUnique({
      where:   { id: orgId },
      include: { members: { include: { user: { select: { id: true, email: true, name: true } } } } },
    });
    if (!org) throw new HttpError(404, 'Organization not found');

    res.json(org);
  } catch (err) { next(err); }
});

// POST /api/orgs/:orgId/members
orgsRouter.post('/:orgId/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { orgId } = req.params;

    const caller = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!caller || caller.role !== 'admin') throw new HttpError(403, 'Forbidden');

    const body = InviteMemberSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, JSON.stringify(body.error.flatten()));

    const { email, role } = body.data;
    const target = await db.user.findUnique({ where: { email } });
    if (!target) throw new HttpError(404, 'User not found');

    const member = await db.orgMember.upsert({
      where:  { orgId_userId: { orgId, userId: target.id } },
      update: { role },
      create: { orgId, userId: target.id, role },
    });
    res.status(201).json(member);
  } catch (err) { next(err); }
});

// DELETE /api/orgs/:orgId/members/:userId
orgsRouter.delete('/:orgId/members/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = req.user!.id;
    const { orgId, userId: targetId } = req.params;

    const caller = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: callerId } },
    });
    if (!caller || (caller.role !== 'admin' && callerId !== targetId)) {
      throw new HttpError(403, 'Forbidden');
    }

    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new HttpError(404, 'Organization not found');
    if (org.ownerId === targetId) throw new HttpError(400, 'Cannot remove org owner');

    await db.orgMember.delete({ where: { orgId_userId: { orgId, userId: targetId } } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
