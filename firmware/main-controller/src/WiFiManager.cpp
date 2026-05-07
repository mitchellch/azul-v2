#include "WiFiManager.h"
#include "Logger.h"
#include <WiFi.h>
#include <Preferences.h>

#define WIFI_CONNECT_TIMEOUT_MS 10000

bool WiFiManager::begin() {
  char ssid[64] = {0};
  char password[64] = {0};
  loadCredentials(ssid, password);

  if (strlen(ssid) == 0) {
    Serial.println("[WiFi] No credentials stored. Use CLI: wifi-set <ssid> <password>");
    return false;
  }

  return connect(ssid, password);
}

bool WiFiManager::connect(const char* ssid, const char* password) {
  Serial.printf("[WiFi] Connecting to %s...\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("[WiFi] Connection timed out");
      return false;
    }
    delay(250);
  }

  Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::reconnectIfNeeded() {
  if (!isConnected()) {
    _failCount++;
    if (_failCount >= 2) {
      _failCount = 0;
      Logger::log("[WiFi] Reconnecting...");
      begin();
    }
  } else {
    _failCount = 0;
  }
}

String WiFiManager::getIPAddress() const {
  return WiFi.localIP().toString();
}

void WiFiManager::loadCredentials(char* ssid, char* password) {
  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.getString("ssid", ssid, 64);
  prefs.getString("password", password, 64);
  prefs.end();
}
