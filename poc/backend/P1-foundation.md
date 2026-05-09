# P1 — Fix the Foundation

**Status:** ⚪ Not started  
**Depends on:** Nothing  
**Unlocks:** Everything

## Goal

Make the server correct before adding features: auth middleware wired up, MQTT crash resolved, error handling centralized.

## Changes

### 1. Prisma schema — add PendingDevice + online field

```prisma
model PendingDevice {
  mac         String   @id
  firmware    String?
  ipAddress   String?  @map("ip_address")
  firstSeenAt DateTime @default(now()) @map("first_seen_at")
  lastSeenAt  DateTime @updatedAt @map("last_seen_at")
  @@map("pending_devices")
}

// Add to Device:
online Boolean @default(false)
```

Run: `npm run db:migrate`

### 2. Auth middleware — `src/middleware/auth.ts` (new)

```typescript
import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export const jwtMiddleware = expressjwt({
  secret: expressJwtSecret({
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    cache: true, rateLimit: true,
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});
```

### 3. requireUser middleware — `src/middleware/requireUser.ts` (new)

Reads `req.auth.sub`, upserts User row, attaches to `req.user`.

### 4. Error handler — `src/middleware/errorHandler.ts` (new)

```typescript
export function errorHandler(err, _req, res, _next) {
  if (err.name === 'UnauthorizedError') return res.status(401).json({ error: 'Unauthorized' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

Wire into `src/index.ts` after all routes.

### 5. Fix MQTT crash — `src/mqtt/handlers.ts`

Replace broken `create` block with:
```typescript
try {
  await db.device.update({ where: { mac }, data: { firmware, ipAddress, lastSeenAt, online: true } });
} catch (e: any) {
  if (e.code === 'P2025') {
    // Device not claimed yet — track in pending_devices
    await db.pendingDevice.upsert({ where: { mac }, update: { firmware, ipAddress }, create: { mac, firmware, ipAddress } });
  }
}
```

### 6. Apply auth to router — `src/router.ts`

```typescript
router.use(jwtMiddleware);
router.use(requireUser);
```

## Done When

- [ ] `npm run dev` starts without errors
- [ ] `GET /health` returns `{ ok: true }` without a token
- [ ] `GET /api/devices` returns 401 without a valid JWT
- [ ] `GET /api/devices` returns 200 with a valid JWT
- [ ] MQTT status message from an unclaimed device does NOT crash the server
- [ ] MQTT status message from a claimed device updates `lastSeenAt` and `online: true`
