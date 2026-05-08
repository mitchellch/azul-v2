#pragma once
#include <Arduino.h>

// Dumps all Azul NVS namespaces in a human-readable format.
// WiFi password is masked. Binary blobs (schedules, audit, changelog)
// show counts only — use the REST API for their content.
class NvsDump {
public:
    // Print to Serial (CLI use)
    static void printToSerial();

    // Serialize to JSON string (REST API use)
    static String toJson();
};
