#pragma once
#include <Arduino.h>

// Global logger that restores the CLI prompt after printing background messages.
// Other modules call Logger::log() instead of Serial.printf() for any message
// that may fire outside of a CLI command response.
class Logger {
public:
  using ReprintFn = void(*)();

  static void setReprintCallback(ReprintFn fn) { _reprint = fn; }

  static void log(const char* fmt, ...) {
    // Clear the current input line before printing
    Serial.print("\r                                                  \r");

    char buf[256];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    Serial.println(buf);

    // Restore the prompt + whatever the user had typed
    if (_reprint) _reprint();
  }

private:
  static ReprintFn _reprint;
};

inline Logger::ReprintFn Logger::_reprint = nullptr;
