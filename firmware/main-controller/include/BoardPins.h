#pragma once
#include <stdint.h>

// Pin assignments for the Azul main-controller. Board variant is selected
// at compile time via BOARD_VARIANT_* macros defined in platformio.ini —
// exactly one must be set. Source of truth for rev2 PCB pins:
// hardware/main-controller-v1/main-controller-v1.kicad_sch.
//
// Zone drivers are active-high: HIGH turns on the zero-cross opto-triac
// (MOC3062M pin 1 → 120Ω → GPIO, pin 2 → GND), which fires the triac and
// energizes the 24VAC solenoid. Zone-driver GPIOs are shared across board
// variants — only the status LED pin differs.

#define MAX_ZONES 12

static constexpr uint8_t ZONE_GPIOS[MAX_ZONES] = {
    38,  // Zone 1
    14,  // Zone 2
    13,  // Zone 3
    12,  // Zone 4
    11,  // Zone 5
    10,  // Zone 6
     9,  // Zone 7
     8,  // Zone 8
    18,  // Zone 9
    17,  // Zone 10
     7,  // Zone 11
     6,  // Zone 12
};

static constexpr uint8_t RAIN_SENSOR_GPIO = 4;
static constexpr uint8_t FLOW_SENSOR_GPIO = 5;

#if defined(BOARD_VARIANT_DEVKIT)
    // ESP32-S3-DevKitC-1 onboard WS2812 RGB LED
    static constexpr uint8_t STATUS_LED_GPIO = 48;
#elif defined(BOARD_VARIANT_REV2)
    // Rev2 PCB: WS2812B silkscreened D5 (see main-controller-v1.kicad_sch)
    static constexpr uint8_t STATUS_LED_GPIO = 21;
#else
    #error "No BOARD_VARIANT_* defined. Set BOARD_VARIANT_DEVKIT or BOARD_VARIANT_REV2 in platformio.ini."
#endif
