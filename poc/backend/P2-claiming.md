# P2 — Device Claiming

**Status:** ⚪ Not started  
**Depends on:** P1  
**Unlocks:** P3, P4, P6

## Goal

Associate an Auth0 user with a device MAC after BLE adoption. Scope all device endpoints to the authenticated user.

## New Endpoint

```
POST /api/devices/claim
Authorization: Bearer <token>
{ "mac": "AC:A7:04:26:60:D0", "name": "Front Yard" }
```

Logic:
1. Check if Device already exists for this MAC:
   - Owned by req.user → return 200 (idempotent)
   - Owned by different user → return 409
2. Check PendingDevice for this MAC:
   - Found: transaction { create Device with userId, delete PendingDevice }
   - Not found: create Device directly
3. Create 8 Zone rows (zone numbers 1–8) for the new device
4. Return the Device record

## Updated Endpoints

- `GET /api/devices` — filter by `userId = req.user.id`
- `GET /api/devices/:mac` — verify device belongs to req.user (use `assertDeviceOwner`)

## New Helper — `src/lib/deviceAccess.ts`

```typescript
export async function assertDeviceOwner(mac: string, userId: string): Promise<Device> {
  const device = await db.device.findUnique({ where: { mac } });
  if (!device) throw new HttpError(404, 'Device not found');
  if (device.userId !== userId) throw new HttpError(403, 'Forbidden');
  return device;
}
```

## Mobile App Update (after P2)

Add `cloudId?: string` to the `Controller` type in `store/controllers.ts`.  
After a successful BLE claim, call `POST /api/devices/claim` and store the returned `id` as `cloudId`.

## Done When

- [ ] `POST /api/devices/claim` with a valid JWT registers the device and returns it
- [ ] Claiming an already-owned device returns 200 (idempotent)
- [ ] Claiming a device owned by another user returns 409
- [ ] `GET /api/devices` only returns devices owned by the requesting user
- [ ] `GET /api/devices/:mac` returns 403 for a device owned by a different user
- [ ] 8 zones are auto-created for each new device
