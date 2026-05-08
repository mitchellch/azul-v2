#pragma once
#include <Arduino.h>

// Manually bump these when making a release.
// Major: breaking change to API or BLE interface
// Minor: new feature, backward compatible
// Patch: bug fix
#define FW_VERSION_MAJOR 0
#define FW_VERSION_MINOR 2
#define FW_VERSION_PATCH 0

// Injected at build time by scripts/inject_version.py — do not edit manually.
#ifndef FW_GIT_SHA
#define FW_GIT_SHA "unknown"
#endif
#ifndef FW_GIT_DIRTY
#define FW_GIT_DIRTY 0
#endif

#define _FW_STR_(x) #x
#define _FW_STR(x) _FW_STR_(x)
#define FW_VERSION_BASE \
    _FW_STR(FW_VERSION_MAJOR) "." \
    _FW_STR(FW_VERSION_MINOR) "." \
    _FW_STR(FW_VERSION_PATCH)

// Build timestamp from compiler — "May  7 2026 14:23:01"
#define FW_BUILD_DATE __DATE__
#define FW_BUILD_TIME __TIME__

// Returns "0.1.0-abc1234" or "0.1.0-abc1234-dirty"
inline String fwVersionFull() {
    String v = FW_VERSION_BASE "-" FW_GIT_SHA;
    if (FW_GIT_DIRTY) v += "-dirty";
    return v;
}
