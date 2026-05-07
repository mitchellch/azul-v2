#pragma once
#include <Arduino.h>

class WiFiManager {
public:
  bool begin();
  bool isConnected() const;
  void reconnectIfNeeded();
  String getIPAddress() const;

private:
  bool connect(const char* ssid, const char* password);
  void loadCredentials(char* ssid, char* password);

  // Require two consecutive failed checks before reconnecting
  uint8_t _failCount = 0;
};
