#pragma once
#include <stdint.h>

// Pin assignments for main-controller-v1 rev2 (custom PCB, not the DevKit).
// Source of truth: hardware/main-controller-v1/main-controller-v1.kicad_sch.
// If the schematic changes, update this file to match.
//
// Zone drivers are active-high: HIGH turns on the zero-cross opto-triac
// (MOC3062M pin 1 → 120Ω → GPIO, pin 2 → GND), which fires the triac and
// energizes the 24VAC solenoid.

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
static constexpr uint8_t STATUS_LED_GPIO  = 21;  // WS2812B D5 on-board indicator
