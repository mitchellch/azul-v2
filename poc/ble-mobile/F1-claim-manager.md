# F1 — ClaimManager

**Status:** ⚪ Not started  
**Depends on:** Nothing  
**Unlocks:** F2

## Goal

Introduce a single module that owns all provisioning state: is the device claimed, who owns it, what is the current PIN. Isolates NVS access for ownership from all other modules.

## Files

| Action | Path |
| :--- | :--- |
| Create | `firmware/main-controller/include/ClaimManager.h` |
| Create | `firmware/main-controller/src/ClaimManager.cpp` |
| Modify | `firmware/main-controller/src/main.cpp` |

## NVS

Namespace: `"azble"`

| Key | Type | Description |
| :--- | :--- | :--- |
| `owner_sub` | String (max 64) | Auth0 sub of the claimed owner. Absent = unclaimed. |
| `pin` | String (6 chars) | Current 6-digit PIN. Cleared after successful claim. |

## API

```cpp
class ClaimManager {
public:
    void begin();                                          // load from NVS
    bool isClaimed() const;
    const char* generatePin();                             // creates if not exists, returns it
    const char* getPin() const;
    bool claim(const char* pin, const char* ownerSub);    // validate + persist; returns false if pin wrong
    bool verifyOwner(const char* sub) const;              // strcmp against stored sub
    void getOwnerSub(char* out, size_t len) const;
};
```

## Implementation Notes

- Use `Preferences` (Arduino NVS wrapper) — same pattern as `TimeManager` and `Scheduler`.
- `generatePin()`: call `esp_random() % 1000000`, `snprintf(buf, 7, "%06lu", val)`. Store to NVS. Idempotent — if pin already exists in NVS, return the stored value.
- `claim()`: compare `pin` arg against stored pin with `strcmp`. If mismatch, return false. If match, `putString("owner_sub", ownerSub)`, clear the pin key (`remove("pin")`), return true.
- Keep all state in member vars after `begin()` — no NVS reads on hot path.

## Changes to main.cpp

```cpp
// Add global
ClaimManager claimMgr;

// In setup(), before bleServer.begin()
claimMgr.begin();
```

## Done When

- [ ] `ClaimManager` compiles cleanly
- [ ] First boot: `isClaimed()` returns false, `generatePin()` returns consistent 6-digit string across calls
- [ ] After `claim(correctPin, sub)`: `isClaimed()` returns true, `verifyOwner(sub)` returns true
- [ ] After reboot: claim state survives (loaded from NVS in `begin()`)
- [ ] Wrong PIN: `claim()` returns false, state unchanged
