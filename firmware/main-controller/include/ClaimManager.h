#pragma once
#include <Preferences.h>

class ClaimManager {
public:
    void begin();

    bool        isClaimed() const       { return _claimed; }
    const char* getPin() const          { return _pin; }
    const char* getOwnerSub() const     { return _ownerSub; }

    // Generates a 6-digit PIN if one doesn't already exist; returns it.
    const char* generatePin();

    // Validates pin, stores ownerSub, clears pin. Returns false on pin mismatch.
    bool claim(const char* pin, const char* ownerSub);

    // Clears ownership and generates a fresh PIN — returns device to unclaimed state.
    void unclaim();

    bool verifyOwner(const char* sub) const;

private:
    bool _claimed   = false;
    char _pin[7]    = {0};   // 6 digits + null
    char _ownerSub[65] = {0};
};
