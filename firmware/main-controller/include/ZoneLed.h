#pragma once
#include <Arduino.h>
#include "ZoneController.h"

// Temporary zone activity indicator using the ESP32-S3-DevKitC-1 onboard
// WS2812 RGB LED (GPIO 48). Each zone maps to a color; the active zone's
// color flashes at half intensity. When no zone is active the LED is off.
//
// Zone → Color mapping:
//   1 = White   2 = Red     3 = Orange  4 = Yellow
//   5 = Green   6 = Blue    7 = Indigo  8 = Violet
//
// To remove: delete this file, ZoneLed.cpp, and the two lines in main.cpp.
// Nothing else in the codebase references ZoneLed.

#define ZONE_LED_PIN  48
#define ZONE_LED_HALF 64   // half intensity (0-255)
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
