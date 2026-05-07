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
    Logger::log("[WiFi] No credentials stored. Use CLI: wifi-set <ssid> <password>");
    return false;
  }

  return connect(ssid, password);
}

bool WiFiManager::connect(const char* ssid, const char* password) {
  Logger::log("[WiFi] Connecting to %s...", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      Logger::log("[WiFi] Connection timed out");
      return false;
    }
    delay(250);
  }

  Logger::log("[WiFi] Connected. IP: %s", WiFi.localIP().toString().c_str());
  return true;
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::reconnectIfNeeded() {
  if (!isConnected()) {
    Logger::log("[WiFi] Reconnecting...");
    begin();
  }
}

String WiFiManager::getIPAddress() const {
  return WiFi.localIP().toString();
}

void WiFiManager::loadCredentials(char* ssid, char* password) {
  Preferences prefs;
  // false = read/write, creates the namespace if it doesn't exist yet
  prefs.begin("wifi", false);
  prefs.getString("ssid", ssid, 64);
  prefs.getString("password", password, 64);
  prefs.end();
}
