#include <Arduino.h>
#include "Logger.h"
#include "ZoneController.h"
#include "WiFiManager.h"
#include "RestServer.h"
#include "BleServer.h"
#include "CLI.h"

ZoneController zones;
WiFiManager    wifiManager;
RestServer     restServer(zones);
BleServer      bleServer(zones);
CLI            serialCli(zones);

#define BLE_NOTIFY_INTERVAL_MS 5000
unsigned long lastBleNotify = 0;

#define WIFI_CHECK_INTERVAL_MS 30000
unsigned long lastWifiCheck = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  Logger::init();

  Serial.println("\n[Azul] Main Controller booting...");

  wifiManager.begin();

  if (wifiManager.isConnected()) {
    restServer.begin();
  } else {
    Serial.println("[REST] Skipping — WiFi not connected. Use CLI to set credentials.");
  }

  bleServer.begin();

  // CLI must start before Logger::log is called so the reprint callback is set
  serialCli.begin();

  Logger::log("[Azul] Boot complete");
}

void loop() {
  unsigned long now = millis();

  zones.tick();
  serialCli.poll();

  if (now - lastBleNotify >= BLE_NOTIFY_INTERVAL_MS) {
    bleServer.notifyStatus();
    lastBleNotify = now;
  }

  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    wifiManager.reconnectIfNeeded();
    lastWifiCheck = now;
  }
}
