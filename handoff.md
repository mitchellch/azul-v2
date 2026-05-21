# Session Handoff — Zone State Management

## Current status

Zone state management on the mobile app has been substantially reworked this session but is
**not yet confirmed working end-to-end**. The last reported symptom was:

> Tap zone 1 → running. Tap zone 2 → shows running briefly, then reverts to idle.

The root cause was identified and fixed in two places:
1. **Server** (`server/src/handlers/devices.ts`): `POST zones/:n/start` now patches the new
   zone as `pending` (not `running`) when another zone is already running.
2. **Client** (`index.tsx`): was reading `controllerStore` with the wrong key (`id` UUID
   instead of `mac`) in cloud mode. Fixed by adding `storeKey` to the context.

These fixes have not been tested since the last code change.

## What works

- Single zone activate/deactivate
- Navigation Home → Controller → zone state is instant (no reconnect delay)
- Cloud SSE connection and poll survive navigation
- Mode switching BLE ↔ Cloud tears down the old manager and starts the new one

## What needs testing

- Zone 2 queuing while zone 1 is running (the core bug above)
- Queue position display ("Next", "#2", "#3") surviving navigation
- Stop All clearing queue correctly
- BLE mode zone state on navigation (same fixes applied, less tested)

## Architecture in one paragraph

Three module-level singletons live for the app lifetime and survive navigation:
`cloudManager.ts` (SSE + poll), `bleManager.ts` (BLE connection), and `controllerStore.ts`
(zone state + queue, single countdown tick). All three are keyed by `mac`. A `ConnectionStarter`
component in `(app)/_layout.tsx` starts the right manager and stops the other on login and on
mode switch. The context providers in `[id]/_layout.tsx` are thin subscribers — they call
`start()` (idempotent no-op) and subscribe to state; they own nothing. Both providers set
`storeKey = mac` in context. The Zones screen reads `storeKey` from context for all store calls.

## Key invariant

All three singletons are keyed by `mac`. The route param `id` (UUID) is never used as a store
key. Never call `controllerStore`, `bleManager`, or `cloudManager` with `id` — always use
`storeKey` from context, or `ctrl.mac` directly.

## Key files

| File | Role |
|---|---|
| `mobile/lib/controllerStore.ts` | Zone state + queue singleton |
| `mobile/lib/cloudManager.ts` | SSE + poll singleton |
| `mobile/lib/bleManager.ts` | BLE connection singleton |
| `mobile/app/(app)/_layout.tsx` | `ConnectionStarter` — boots connections at login |
| `mobile/app/(app)/controller/[id]/_layout.tsx` | Mounts the correct provider |
| `mobile/context/CloudControllerConnection.tsx` | Thin cloud subscriber |
| `mobile/context/ControllerConnection.tsx` | Thin BLE subscriber |
| `mobile/app/(app)/controller/[id]/index.tsx` | Zones screen — tap logic |
| `server/src/handlers/devices.ts` | `anyRunning` patch on start_zone (line ~172) |

## Diagram

`docs/design/zone-state-management.excalidraw` — open in VS Code with the Excalidraw extension.
