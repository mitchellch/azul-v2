import { Request, Response, NextFunction } from 'express';
import { db } from '../db/client';

// express-jwt v8 places the decoded JWT on req.auth
declare module 'express' {
  interface Request { auth?: Record<string, unknown>; }
}

// Augment Express Request to carry the resolved actor (user or M2M)
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; auth0Sub: string; email: string; name: string | null; isM2M?: boolean };
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const sub   = (req.auth as any)?.sub as string | undefined;
  const email = (req.auth as any)?.email as string | undefined;
  const name  = (req.auth as any)?.name  as string | undefined;

  if (!sub) {
    res.status(401).json({ error: 'Missing auth subject' });
    return;
  }

  // M2M / client-credentials tokens: synthetic user with full access
  if (sub.endsWith('@clients')) {
    req.user = { id: sub, auth0Sub: sub, email: 'support@azul.internal', name: 'M2M', isM2M: true };
    next();
    return;
  }

  try {
    const user = await db.user.upsert({
      where:  { auth0Sub: sub },
      update: {
        ...(email ? { email } : {}),
        ...(name  ? { name  } : {}),
      },
      create: { auth0Sub: sub, email: email ?? sub, name: name ?? null },
    });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
