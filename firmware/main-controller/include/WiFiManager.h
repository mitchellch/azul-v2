#pragma once
#include <Arduino.h>

class WiFiManager {
public:
  bool begin();
  bool isConnected() const;
  void reconnectIfNeeded();
  String getIPAddress() const;

private:
  void loadCredentials(char* ssid, char* password);
};
