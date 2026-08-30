#include "WiFiManager.h"
#include "Logger.h"
#include <WiFi.h>
#include <Preferences.h>

bool WiFiManager::begin() {
  char ssid[64] = {0};
  char password[64] = {0};
  loadCredentials(ssid, password);

  if (strlen(ssid) == 0) {
    Serial.println("[WiFi] No credentials stored. Use CLI: wifi-set <ssid> <password>");
    return false;
  }

  Serial.printf("[WiFi] Connecting to %s (async)...\n", ssid);
  WiFi.mode(WIFI_STA);
  // Auto-reconnect must be enabled BEFORE begin() so the driver installs its
  // disconnect handler. Persistent(true) stores creds in NVS so the RTOS-level
  // wpa_supplicant can also drive reconnect without our involvement.
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(ssid, password);
  // Non-blocking: return immediately. Main loop polls isConnected() and starts
  // dependent services (REST/NTP/MQTT) once WL_CONNECTED lands. Keeps the
  // status LED tick() responsive during connect + reconnect.
  return true;
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::reconnectIfNeeded() {
  // setAutoReconnect(true) handles most disconnects at the driver level. This
  // is a backstop for cases where auto-reconnect gives up (e.g. AP was gone
  // long enough for the STA state machine to stop trying). WiFi.reconnect()
  // is non-blocking: it kicks disconnect+begin() using the last-saved creds.
  if (isConnected()) return;
  WiFi.reconnect();
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
