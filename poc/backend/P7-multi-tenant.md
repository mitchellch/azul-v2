# P7 — Multi-Tenant / Landscaper Org Model

**Status:** ⚪ Not started  
**Depends on:** P3  
**Unlocks:** Landscaper portal in web app

## Goal

Landscapers can manage multiple client controllers. Customers can grant access to a landscaper.

## Schema Additions

```prisma
model Organization {
  id        String      @id @default(uuid())
  name      String
  slug      String      @unique
  ownerId   String      @map("owner_id")
  createdAt DateTime    @default(now()) @map("created_at")

  owner     User        @relation("OrgOwner", fields: [ownerId], references: [id])
  members   OrgMember[]
  devices   Device[]

  @@map("organizations")
}

model OrgMember {
  orgId  String @map("org_id")
  userId String @map("user_id")
  role   String // "admin" | "member"

  org    Organization @relation(fields: [orgId], references: [id])
  user   User         @relation(fields: [userId], references: [id])

  @@id([orgId, userId])
  @@map("org_members")
}

// Add to Device:
orgId  String? @map("org_id")
org    Organization? @relation(fields: [orgId], references: [id])
```

## Auth0 Organizations

Each `Organization` row maps to an Auth0 Organization. Auth0 JWT will carry `org_id` claim. Use this to scope org-level API access.

## Updated `assertDeviceOwner`

```typescript
export async function assertDeviceAccess(mac, userId, orgId?) {
  const device = await db.device.findUnique({ where: { mac } });
  if (!device) throw new HttpError(404, 'Device not found');

  // Direct owner
  if (device.userId === userId) return device;

  // Org admin/member
  if (device.orgId && orgId && device.orgId === orgId) {
    const member = await db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
    if (member) return device;
  }

  throw new HttpError(403, 'Forbidden');
}
```

## New Endpoints

```
POST   /api/orgs                    — create organization (landscaper registers)
GET    /api/orgs/:orgId/devices     — list all devices in org
POST   /api/orgs/:orgId/members     — invite a customer
PUT    /api/devices/:mac/org        — assign device to an org (customer grants access)
DELETE /api/devices/:mac/org        — revoke org access
```

## Done When

- [ ] Landscaper can create an org
- [ ] Customer can grant their device to the org
- [ ] Org admin can see and control all org devices
- [ ] Revoking org access removes the device from the org's view
- [ ] Direct owner always retains access regardless of org status
