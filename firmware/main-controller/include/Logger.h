#pragma once
#include <Arduino.h>

// Thread-safe logger that restores the CLI prompt after printing background messages.
// Uses a FreeRTOS mutex so it's safe to call from any task.
class Logger {
public:
  using ReprintFn = void(*)();

  static void init();
  static void setReprintCallback(ReprintFn fn);
  static void log(const char* fmt, ...);

  static void setVerbose(bool on);
  static bool isVerbose();

private:
  static ReprintFn _reprint;
  static SemaphoreHandle_t _mutex;
  static bool _verbose;
};
