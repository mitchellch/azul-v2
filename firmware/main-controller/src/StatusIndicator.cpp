#include "StatusIndicator.h"
#include <Adafruit_NeoPixel.h>
#include <math.h>

// Azul brand — royal cobalt blue. Used wherever the LED signals "healthy"
// or "connecting to Azul cloud infrastructure".
static constexpr uint8_t AZUL_R = 25;
static constexpr uint8_t AZUL_G = 60;
static constexpr uint8_t AZUL_B = 200;

static Adafruit_NeoPixel pixel(1, STATUS_LED_GPIO, NEO_GRB + NEO_KHZ800);

// base × brightness ÷ 255, saturating.
static inline uint8_t scale(uint8_t base, uint8_t brightness) {
    return (uint16_t)base * brightness / 255;
}

// Half-sine breathe. Returns 0-255 brightness that oscillates between
// lo and hi over period_ms.
static uint8_t breatheBrightness(unsigned long now, uint32_t period_ms,
                                 uint8_t lo, uint8_t hi) {
    if (period_ms == 0) return hi;
    float phase = (float)(now % period_ms) / (float)period_ms;
    float sine  = (sinf(phase * 2.0f * (float)PI) + 1.0f) * 0.5f;   // 0..1
    return lo + (uint8_t)(sine * (hi - lo));
}

// Square wave: on for on_ms, off for off_ms.
static bool squareOn(unsigned long now, uint32_t on_ms, uint32_t off_ms) {
    return (now % (on_ms + off_ms)) < on_ms;
}

StatusIndicator::StatusIndicator(ZoneController& zones)
    : _zones(zones)
    , _bootPhase(BootPhase::Init)
    , _otaPhase(OtaPhase::None)
    , _otaProgressPct(0)
    , _error(ErrorKind::None)
    , _errorStart(0) {}

void StatusIndicator::begin() {
    pixel.begin();
    pixel.setBrightness(255);      // per-frame brightness handled by scale()
    pixel.clear();
    pixel.show();
}

void StatusIndicator::setOtaPhase(OtaPhase p, uint8_t progressPct) {
    _otaPhase = p;
    _otaProgressPct = progressPct > 100 ? 100 : progressPct;
}

void StatusIndicator::setError(ErrorKind e) {
    if (e == _error) return;
    // OtaFailed is sticky until reboot — an OTA-failure red blink must
    // not be overwritten by a transient WiFi/MQTT reconnect blip.
    if (_error == ErrorKind::OtaFailed) return;
    _error = e;
    _errorStart = millis();
}

void StatusIndicator::writePixel(uint8_t r, uint8_t g, uint8_t b) {
    pixel.setPixelColor(0, pixel.Color(r, g, b));
    pixel.show();
}

uint8_t StatusIndicator::activeZoneId() const {
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        const Zone* z = _zones.getZone(i);
        if (z && z->status == ZoneStatus::RUNNING) return i;
    }
    return 0;
}

void StatusIndicator::colorForZone(uint8_t zoneId, uint8_t& r, uint8_t& g, uint8_t& b) {
    switch (zoneId) {
        case 1:  r=255; g=255; b=255; break;   // White
        case 2:  r=255; g=0;   b=0;   break;   // Red
        case 3:  r=255; g=128; b=0;   break;   // Orange
        case 4:  r=255; g=255; b=0;   break;   // Yellow
        case 5:  r=0;   g=255; b=0;   break;   // Green
        case 6:  r=0;   g=0;   b=255; break;   // Blue
        case 7:  r=75;  g=0;   b=130; break;   // Indigo
        case 8:  r=148; g=0;   b=211; break;   // Violet
        case 9:  r=255; g=20;  b=147; break;   // Hot pink
        case 10: r=0;   g=255; b=255; break;   // Cyan
        case 11: r=128; g=255; b=0;   break;   // Chartreuse
        case 12: r=255; g=0;   b=255; break;   // Magenta
        default: r=255; g=255; b=255; break;
    }
}

void StatusIndicator::tick() {
    const unsigned long now = millis();

    // ── 1. OTA_FAILED: 3 red blinks (250ms on / 250ms off = 1500ms) then dark ──
    if (_error == ErrorKind::OtaFailed) {
        unsigned long since = now - _errorStart;
        if (since < 1500) {
            bool on = ((since / 250) % 2) == 0;
            writePixel(on ? 255 : 0, 0, 0);
        } else {
            writePixel(0, 0, 0);
        }
        return;
    }

    // ── 2. OTA in progress ──
    if (_otaPhase == OtaPhase::Downloading) {
        // Orange breathe. Period 2500ms at 0% → 800ms at 100% — faster
        // breathing signals more progress. Linear scale, 17ms per %.
        uint32_t period = 2500 - (uint32_t)_otaProgressPct * 17;
        uint8_t  br = breatheBrightness(now, period, 20, 220);
        writePixel(scale(255, br), scale(128, br), 0);
        return;
    }
    if (_otaPhase == OtaPhase::Verifying) {
        // Fast yellow pulse — verify happens right before reboot into new image
        bool on = squareOn(now, 100, 100);
        writePixel(on ? 200 : 0, on ? 200 : 0, 0);
        return;
    }

    // ── 3. Network errors: slow red pulse ──
    if (_error == ErrorKind::NoWifi || _error == ErrorKind::NoMqtt) {
        bool on = squareOn(now, 300, 700);
        writePixel(on ? 180 : 0, 0, 0);
        return;
    }

    // ── 4. Zone running: breathe zone color ──
    uint8_t zoneId = activeZoneId();
    if (zoneId > 0) {
        uint8_t r, g, b;
        colorForZone(zoneId, r, g, b);
        uint8_t br = breatheBrightness(now, 2000, 30, 130);
        writePixel(scale(r, br), scale(g, br), scale(b, br));
        return;
    }

    // ── 5. Boot phase: breathe a per-phase color ──
    switch (_bootPhase) {
        case BootPhase::Init: {
            uint8_t br = breatheBrightness(now, 1500, 10, 80);
            writePixel(br, br, br);        // dim white
            return;
        }
        case BootPhase::Wifi: {
            uint8_t br = breatheBrightness(now, 1500, 20, 200);
            writePixel(0, scale(120, br), scale(255, br));   // light blue
            return;
        }
        case BootPhase::Time: {
            uint8_t br = breatheBrightness(now, 1000, 20, 200);
            writePixel(0, br, br);         // cyan
            return;
        }
        case BootPhase::Mqtt: {
            uint8_t br = breatheBrightness(now, 1500, 20, 200);
            writePixel(scale(AZUL_R, br), scale(AZUL_G, br), scale(AZUL_B, br));
            return;
        }
        case BootPhase::Ready: {
            // 6. Heartbeat wink: brief 100ms dim flash of Azul blue every 2000ms
            uint32_t p = now % 2000;
            if (p < 100) {
                writePixel(scale(AZUL_R, 40), scale(AZUL_G, 40), scale(AZUL_B, 40));
            } else {
                writePixel(0, 0, 0);
            }
            return;
        }
    }
}
