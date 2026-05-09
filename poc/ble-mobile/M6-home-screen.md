# M6 — Home Screen Update

**Status:** ⚪ Not started  
**Depends on:** M3, M5  
**Unlocks:** M7

## Goal

Replace the placeholder in `home.tsx` with a real controller list driven by the Zustand store.

## File

Modify `mobile/app/(app)/home.tsx`

## Changes

1. Import `useControllerStore`.
2. Replace the placeholder `View` with a `FlatList` over `controllers`.
3. Each row: controller name + last-seen timestamp + `>` chevron. Tapping navigates to `controller/[id]`.
4. Add a `+` button to the header (via `useNavigation` + `useLayoutEffect` or expo-router `<Stack.Screen options>`) that navigates to `scan.tsx`.
5. Empty state (no controllers): centered card reading "No controllers yet. Tap + to add one."

## Done When

- [ ] Empty state renders when store is empty
- [ ] Adopted controller appears in list
- [ ] Tapping a controller navigates to detail screen
- [ ] "+" navigates to scan screen
- [ ] List updates immediately after adopting a new controller (Zustand reactivity)
