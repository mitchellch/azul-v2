#pragma once
#include <Arduino.h>
#include "ZoneController.h"
#include "BoardPins.h"

// Single WS2812 RGB LED that surfaces every user-visible firmware state.
// The pin comes from BoardPins.h (48 on the dev kit, 21 on rev2 PCBs).
//
// Priority when multiple things are true (highest first):
//   1. Error: OTA_FAILED         → 3 red blinks then off
//   2. OTA update in progress    → orange breathe (rate scales with %)
//                                  or fast yellow pulse while verifying
//   3. Error: NoWifi / NoMqtt    → slow red pulse
//   4. Zone running              → breathe zone's color
//   5. Boot phase (Init..Mqtt)   → per-phase breathe indicating what we're
//                                  currently waiting on
//   6. READY                     → heartbeat wink of Azul blue every 2s
//                                  (brief 100ms dim flash, dark otherwise)
//
// Colors:
//   Init         dim white         "MCU alive, subsystems coming up"
//   Wifi         light blue        "connecting to the network"
//   Time         cyan              "syncing NTP"
//   Mqtt         Azul blue         "connecting to broker"
//   Ready        Azul blue         idle heartbeat — the "I'm alive" signal
//   OTA download orange            firmware image transferring
//   OTA verify   yellow            image verifying / swap pending
//   Error        red               network unreachable or OTA failed
//   Zones 1..12  see colorForZone()

class StatusIndicator {
public:
    // Boot progresses through these phases as subsystems come online.
    // Advance via setBootPhase() from main.cpp as each manager attaches.
    enum class BootPhase : uint8_t {
        Init,   // MCU up, core services initializing
        Wifi,   // WiFi connecting or reconnecting
        Time,   // NTP syncing
        Mqtt,   // MQTT broker connecting
        Ready,  // fully up — enters heartbeat idle
    };

    // OTA state — takes priority over boot phase.
    enum class OtaPhase : uint8_t {
        None,
        Downloading,   // image transfer in progress; progress % modulates breathe rate
        Verifying,     // download complete, verifying/installing
    };

    // Error kinds — persistent until cleared.
    enum class ErrorKind : uint8_t {
        None,
        NoWifi,      // slow red pulse
        NoMqtt,      // slow red pulse
        OtaFailed,   // 3 red blinks then dark until reboot
    };

    explicit StatusIndicator(ZoneController& zones);

    void begin();
    void tick();

    void setBootPhase(BootPhase p) { _bootPhase = p; }
    void setOtaPhase(OtaPhase p, uint8_t progressPct = 0);
    void setError(ErrorKind e);
    void clearError() { setError(ErrorKind::None); }

    BootPhase bootPhase() const { return _bootPhase; }

private:
    ZoneController& _zones;
    BootPhase       _bootPhase;
    OtaPhase        _otaPhase;
    uint8_t         _otaProgressPct;
    ErrorKind       _error;
    unsigned long   _errorStart;

    void writePixel(uint8_t r, uint8_t g, uint8_t b);
    uint8_t activeZoneId() const;
    static void colorForZone(uint8_t zoneId, uint8_t& r, uint8_t& g, uint8_t& b);
};
