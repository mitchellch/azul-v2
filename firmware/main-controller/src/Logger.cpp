#include "Logger.h"

Logger::ReprintFn Logger::_reprint = nullptr;
SemaphoreHandle_t Logger::_mutex = nullptr;

void Logger::init() {
  _mutex = xSemaphoreCreateMutex();
}

void Logger::setReprintCallback(ReprintFn fn) {
  _reprint = fn;
}

void Logger::log(const char* fmt, ...) {
  if (_mutex && xSemaphoreTake(_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    // Clear current input line
    Serial.print("\r                                                  \r");

    char buf[256];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    Serial.println(buf);

    if (_reprint) _reprint();

    xSemaphoreGive(_mutex);
  }
}
