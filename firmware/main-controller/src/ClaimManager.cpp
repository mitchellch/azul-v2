#include "ClaimManager.h"
#include "Logger.h"
#include <cstring>
#include <esp_random.h>

static const char* NVS_NS = "azble";

void ClaimManager::begin() {
    Preferences prefs;
    prefs.begin(NVS_NS, true); // read-only

    _claimed = prefs.getBool("claimed", false);

    String sub = prefs.getString("owner_sub", "");
    strlcpy(_ownerSub, sub.c_str(), sizeof(_ownerSub));

    String pin = prefs.getString("pin", "");
    strlcpy(_pin, pin.c_str(), sizeof(_pin));

    prefs.end();

    Logger::log("[Claim] claimed=%d owner=%s", _claimed, _claimed ? _ownerSub : "none");
}

const char* ClaimManager::generatePin() {
    if (_pin[0] != '\0') return _pin; // already generated this boot

    uint32_t val = esp_random() % 1000000;
    snprintf(_pin, sizeof(_pin), "%06lu", (unsigned long)val);

    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putString("pin", _pin);
    prefs.end();

    Logger::log("[Claim] Generated PIN: %s", _pin);
    return _pin;
}

bool ClaimManager::claim(const char* pin, const char* ownerSub) {
    if (strcmp(pin, _pin) != 0) {
        Logger::log("[Claim] PIN mismatch");
        return false;
    }

    strlcpy(_ownerSub, ownerSub, sizeof(_ownerSub));
    _claimed = true;
    _pin[0] = '\0';

    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putBool("claimed", true);
    prefs.putString("owner_sub", _ownerSub);
    prefs.remove("pin");
    prefs.end();

    Logger::log("[Claim] Device claimed by %s", _ownerSub);
    return true;
}

bool ClaimManager::verifyOwner(const char* sub) const {
    return _claimed && strcmp(sub, _ownerSub) == 0;
}

void ClaimManager::unclaim() {
    _claimed = false;
    _ownerSub[0] = '\0';
    _pin[0] = '\0';

    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.remove("claimed");
    prefs.remove("owner_sub");
    prefs.remove("pin");
    prefs.end();

    Logger::log("[Claim] Device unclaimed — generating new PIN");
    generatePin(); // ready for re-adoption immediately
}
