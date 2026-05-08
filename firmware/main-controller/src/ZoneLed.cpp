#include "ZoneLed.h"
#include <Adafruit_NeoPixel.h>

static Adafruit_NeoPixel pixel(1, ZONE_LED_PIN, NEO_GRB + NEO_KHZ800);

ZoneLed::ZoneLed(ZoneController& zones)
    : _zones(zones), _lastFlash(0), _ledOn(false) {}

void ZoneLed::begin() {
    pixel.begin();
    pixel.setBrightness(ZONE_LED_HALF);
    off();
}

void ZoneLed::tick() {
    // Find the lowest-numbered active zone
    uint8_t activeZone = 0;
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        const Zone* z = _zones.getZone(i);
        if (z && z->status == ZoneStatus::RUNNING) {
            activeZone = i;
            break;
        }
    }

    if (activeZone == 0) {
        off();
        _ledOn = false;
        return;
    }

    // Flash at ZONE_LED_FLASH_MS interval
    unsigned long now = millis();
    if (now - _lastFlash >= ZONE_LED_FLASH_MS) {
        _lastFlash = now;
        _ledOn = !_ledOn;

        if (_ledOn) {
            uint8_t r, g, b;
            colorForZone(activeZone, r, g, b);
            setColor(r, g, b);
        } else {
            off();
        }
    }
}

void ZoneLed::setColor(uint8_t r, uint8_t g, uint8_t b) {
    pixel.setPixelColor(0, pixel.Color(r, g, b));
    pixel.show();
}

void ZoneLed::off() {
    pixel.setPixelColor(0, 0);
    pixel.show();
}

void ZoneLed::colorForZone(uint8_t zoneId, uint8_t& r, uint8_t& g, uint8_t& b) const {
    // Rainbow + white at half intensity
    switch (zoneId) {
        case 1: r=255; g=255; b=255; break; // White
        case 2: r=255; g=0;   b=0;   break; // Red
        case 3: r=255; g=128; b=0;   break; // Orange
        case 4: r=255; g=255; b=0;   break; // Yellow
        case 5: r=0;   g=255; b=0;   break; // Green
        case 6: r=0;   g=0;   b=255; break; // Blue
        case 7: r=75;  g=0;   b=130; break; // Indigo
        case 8: r=148; g=0;   b=211; break; // Violet
        default: r=255; g=255; b=255; break;
    }
}
