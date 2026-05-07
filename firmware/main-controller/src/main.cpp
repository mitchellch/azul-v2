#include <Arduino.h>
#include "Logger.h"
#include "ZoneController.h"
#include "WiFiManager.h"
#include "TimeManager.h"
#include "ScheduleStore.h"
#include "AuditLog.h"
#include "ChangeLog.h"
#include "Scheduler.h"
#include "RestServer.h"
#include "BleServer.h"
#include "CLI.h"

ZoneController zones;
WiFiManager    wifiManager;
TimeManager    timeManager;
ScheduleStore  scheduleStore;
AuditLog       auditLog;
ChangeLog      changeLog;
Scheduler      scheduler(timeManager, zones, scheduleStore, auditLog, changeLog);
RestServer     restServer(zones, scheduler, auditLog, changeLog, timeManager);
BleServer      bleServer(zones);
CLI            serialCli(zones, scheduler, auditLog);

#define BLE_NOTIFY_INTERVAL_MS   5000
#define WIFI_CHECK_INTERVAL_MS  30000
#define NTP_SYNC_INTERVAL_MS  3600000

unsigned long lastBleNotify  = 0;
unsigned long lastWifiCheck  = 0;
unsigned long lastNtpSync    = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  Logger::init();

  Serial.println("\n[Azul] Main Controller booting...");

  scheduleStore.begin();
  auditLog.begin();
  changeLog.begin();
  scheduler.begin();

  wifiManager.begin();

  if (wifiManager.isConnected()) {
    restServer.begin();
    timeManager.begin(); // NTP requires WiFi
  } else {
    Serial.println("[REST] Skipping — WiFi not connected. Use CLI to set credentials.");
    Serial.println("[Time] Skipping NTP — WiFi not connected.");
  }

  bleServer.begin();
  serialCli.begin();

  Logger::log("[Azul] Boot complete");
}

void loop() {
  unsigned long now = millis();

  zones.tick();
  scheduler.tick();
  serialCli.poll();

  if (now - lastBleNotify >= BLE_NOTIFY_INTERVAL_MS) {
    bleServer.notifyStatus();
    lastBleNotify = now;
  }

  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    wifiManager.reconnectIfNeeded();
    // Start REST/NTP if we just reconnected
    if (wifiManager.isConnected() && !timeManager.isSynced()) {
      restServer.begin();
      timeManager.begin();
    }
    lastWifiCheck = now;
  }

  // Periodic NTP re-sync
  if (now - lastNtpSync >= NTP_SYNC_INTERVAL_MS) {
    if (wifiManager.isConnected()) {
      timeManager.begin();
    }
    lastNtpSync = now;
  }
}
