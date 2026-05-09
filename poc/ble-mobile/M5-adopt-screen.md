# M5 — Adopt Screen

**Status:** ⚪ Not started  
**Depends on:** M2, M3  
**Unlocks:** M6, Integration milestone I1

## Goal

Walk the user through connecting to a new controller and completing the TOFU claim flow. After this screen, the controller is bound to the user's Auth0 account and saved to the local store.

## File

Create `mobile/app/(app)/adopt.tsx`

## Flow

1. Receive `deviceId` from navigation params.
2. Show "Connecting..." — call `connect(deviceId)`.
3. On connect: call `readPin(device)` to read the 6-digit PIN from `b5`.
4. Display the PIN prominently: **"Confirm the code matches your controller: 1 2 3 4 5 6"**
5. Two buttons: **"Confirm & Adopt"** and **"Cancel"**.
6. On Confirm: call `sendCommand(device, 'claim', {pin, owner_sub: user.sub})`. No `auth_token` — device is unclaimed.
7. On success response `{claimed: true}`:
   - Call `addController({id: uuid(), deviceId, name: device.name, ownerSub: user.sub, claimedAt: Date.now()})`.
   - Navigate to `controller/[id]` detail screen.
8. On failure: show error message. If PIN mismatch: "Incorrect code — make sure you're connecting to the right controller." Allow retry.
9. On Cancel or connection failure: disconnect and navigate back to scan.

## State

```ts
const [step, setStep] = useState<'connecting' | 'confirm' | 'claiming' | 'error'>('connecting');
const [pin, setPin] = useState('');
const [errorMessage, setErrorMessage] = useState('');
```

## Notes

- The `user.sub` comes from `useAuthStore()`.
- The PIN characteristic (`b5`) returns an empty string on an already-claimed device. If the app reads an empty PIN, show an error: "This controller is already claimed by another account."
- Do not show a text input for the PIN — the user only confirms visually. The PIN value read from `b5` is what gets sent in the `claim` command.

## Done When

- [ ] Connects to device and reads PIN successfully
- [ ] PIN displayed clearly to user
- [ ] Successful claim navigates to controller detail
- [ ] Already-claimed device shows appropriate error
- [ ] Wrong PIN (firmware rejects) shows retry option
- [ ] Cancel disconnects cleanly and returns to scan
- [ ] Adopted controller persists in store across app restarts
