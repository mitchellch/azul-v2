#pragma once
#include <Arduino.h>
#include "ZoneController.h"
#include "BoardPins.h"

// Zone activity indicator on the board's WS2812 RGB LED. The pin is
// selected by board variant in BoardPins.h (GPIO 48 on the dev kit,
// GPIO 21 on rev2 PCBs). Each zone maps to a color; the active zone's
// color flashes at half intensity. When no zone is active the LED is off.
//
// Zone → Color mapping:
//   1 = White   2 = Red     3 = Orange  4 = Yellow
//   5 = Green   6 = Blue    7 = Indigo  8 = Violet
//   9 = Pink   10 = Cyan   11 = Lime   12 = Magenta

#define ZONE_LED_HALF 32   // reduced intensity (0-255)
#define ZONE_LED_FLASH_MS 500

class ZoneLed {
public:
    ZoneLed(ZoneController& zones);
    void begin();

    // Call from main loop — updates LED state based on active zones
    void tick();

private:
    ZoneController& _zones;
    unsigned long   _lastFlash;
    bool            _ledOn;

    void setColor(uint8_t r, uint8_t g, uint8_t b);
    void off();
    void colorForZone(uint8_t zoneId, uint8_t& r, uint8_t& g, uint8_t& b) const;
};
