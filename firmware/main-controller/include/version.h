#pragma once

// Manually bump these when making a release.
// Major: breaking change to API or BLE interface
// Minor: new feature, backward compatible
// Patch: bug fix
#define FW_VERSION_MAJOR 0
#define FW_VERSION_MINOR 1
#define FW_VERSION_PATCH 0

// Injected at build time by scripts/inject_version.py — do not edit manually.
#ifndef FW_GIT_SHA
#define FW_GIT_SHA "unknown"
#endif
#ifndef FW_GIT_DIRTY
#define FW_GIT_DIRTY 0
#endif

// Full version string: "0.1.0-abc1234" or "0.1.0-abc1234-dirty"
#define _FW_VER_STR_(a,b,c) #a "." #b "." #c
#define _FW_VER_STR(a,b,c) _FW_VER_STR_(a,b,c)
#define FW_VERSION_BASE _FW_VER_STR(FW_VERSION_MAJOR, FW_VERSION_MINOR, FW_VERSION_PATCH)
#define FW_VERSION_FULL (FW_GIT_DIRTY \
  ? FW_VERSION_BASE "-" FW_GIT_SHA "-dirty" \
  : FW_VERSION_BASE "-" FW_GIT_SHA)
