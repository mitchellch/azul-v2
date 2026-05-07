#include "CLI.h"
#include "version.h"
#include "Logger.h"
#include <WiFi.h>
#include <Preferences.h>

// Static pointer to the active CLI instance for the Logger reprint callback
static CLI* s_instance = nullptr;
static void reprintPrompt() {
  if (s_instance) s_instance->printPrompt();
}

CLI::CLI(ZoneController& zones) : _zones(zones), _bufLen(0) {
  memset(_buf, 0, sizeof(_buf));
  s_instance = this;
}

void CLI::begin() {
  Logger::setReprintCallback(reprintPrompt);
  Serial.println("\r\n=============================");
  Serial.println("  Azul Main Controller CLI");
  Serial.printf( "  Firmware: %s\r\n", fwVersionFull().c_str());
  Serial.println("  Type 'help' for commands");
  Serial.println("=============================\r\n");
  Serial.print("> ");
}

void CLI::printPrompt() {
  Serial.print("> ");
  // Reprint whatever the user had typed so far
  if (_bufLen > 0) Serial.print(_buf);
}

void CLI::poll() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\r') continue;

    if (c == '\n') {
      _buf[_bufLen] = '\0';
      Serial.println();
      if (_bufLen > 0) {
        dispatch(_buf);
      }
      Serial.print("> ");
      _bufLen = 0;
      memset(_buf, 0, sizeof(_buf));
      return;
    }

    // Backspace
    if (c == 0x7F || c == '\b') {
      if (_bufLen > 0) {
        _bufLen--;
        Serial.print("\b \b");
      }
      return;
    }

    if (_bufLen < sizeof(_buf) - 1) {
      _buf[_bufLen++] = c;
      Serial.print(c); // echo
    }
  }
}

void CLI::dispatch(const char* line) {
  char cmd[32] = {0};
  char args[96] = {0};

  // Split into command and args
  const char* space = strchr(line, ' ');
  if (space) {
    size_t cmdLen = space - line;
    strlcpy(cmd, line, min(cmdLen + 1, sizeof(cmd)));
    strlcpy(args, space + 1, sizeof(args));
  } else {
    strlcpy(cmd, line, sizeof(cmd));
  }

  if      (strcmp(cmd, "help")        == 0) printHelp();
  else if (strcmp(cmd, "status")      == 0) cmdStatus();
  else if (strcmp(cmd, "zones")       == 0) cmdZones();
  else if (strcmp(cmd, "start")       == 0) cmdStart(args);
  else if (strcmp(cmd, "stop")        == 0) cmdStop(args);
  else if (strcmp(cmd, "stop-all")    == 0) cmdStopAll();
  else if (strcmp(cmd, "wifi-set")    == 0) cmdWifiSet(args);
  else if (strcmp(cmd, "wifi-status") == 0) cmdWifiStatus();
  else if (strcmp(cmd, "version")     == 0) cmdVersion();
  else if (strcmp(cmd, "reboot")      == 0) cmdReboot();
  else Serial.printf("Unknown command: '%s'. Type 'help'.\r\n", cmd);
}

void CLI::printHelp() {
  Serial.println("Commands:");
  Serial.println("  status                    Device status");
  Serial.println("  zones                     List all zones");
  Serial.println("  start <zone> <seconds>    Start a zone");
  Serial.println("  stop <zone>               Stop a zone");
  Serial.println("  stop-all                  Stop all zones");
  Serial.println("  wifi-set <ssid> <pass>    Save WiFi credentials");
  Serial.println("  wifi-status               Show WiFi connection status");
  Serial.println("  version                   Show firmware version");
  Serial.println("  reboot                    Reboot the device");
}

void CLI::cmdStatus() {
  float tempC = temperatureRead();
  Serial.printf("Firmware:      %s\r\n", fwVersionFull().c_str());
  Serial.printf("Uptime:        %lu seconds\r\n", millis() / 1000);
  Serial.printf("Temperature:   %.1f C / %.1f F\r\n", tempC, tempC * 9.0f / 5.0f + 32.0f);
  if (WiFi.isConnected()) {
    Serial.printf("WiFi:          %s (%s)\r\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  } else {
    Serial.printf("WiFi:          disconnected\r\n");
  }
  Serial.printf("Zones running: %s\r\n", _zones.isAnyZoneRunning() ? "yes" : "no");
}

void CLI::cmdVersion() {
  Serial.printf("Firmware:  %s\r\n", fwVersionFull().c_str());
  Serial.printf("Version:   %d.%d.%d\r\n", FW_VERSION_MAJOR, FW_VERSION_MINOR, FW_VERSION_PATCH);
  Serial.printf("Git SHA:   %s%s\r\n", FW_GIT_SHA, FW_GIT_DIRTY ? " (dirty)" : "");
  Serial.printf("Built:     %s %s\r\n", FW_BUILD_DATE, FW_BUILD_TIME);
}

void CLI::cmdZones() {
  Serial.println("ID  Name                     Status    Remaining");
  Serial.println("--  -----------------------  --------  ---------");
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    Serial.printf("%-3d %-24s %-9s %lu s\r\n",
      z->id, z->name,
      z->status == ZoneStatus::RUNNING ? "running" : "idle",
      z->runtimeSeconds);
  }
}

void CLI::cmdStart(const char* args) {
  uint8_t zoneId = 0;
  uint32_t duration = 60;
  int parsed = sscanf(args, "%hhu %lu", &zoneId, &duration);
  if (parsed < 1 || zoneId == 0) {
    Serial.println("Usage: start <zone_id> [duration_seconds]");
    return;
  }
  if (_zones.startZone(zoneId, duration)) {
    Serial.printf("Zone %d started for %lu seconds\r\n", zoneId, duration);
  } else {
    Serial.printf("Invalid zone ID: %d\r\n", zoneId);
  }
}

void CLI::cmdStop(const char* args) {
  uint8_t zoneId = atoi(args);
  if (zoneId == 0) { Serial.println("Usage: stop <zone_id>"); return; }
  if (_zones.stopZone(zoneId)) {
    Serial.printf("Zone %d stopped\r\n", zoneId);
  } else {
    Serial.printf("Invalid zone ID: %d\r\n", zoneId);
  }
}

void CLI::cmdStopAll() {
  _zones.stopAll();
  Serial.println("All zones stopped");
}

void CLI::cmdWifiSet(const char* args) {
  char ssid[64] = {0};
  char password[64] = {0};

  // Parse: wifi-set <ssid> <password>
  const char* space = strchr(args, ' ');
  if (!space) {
    Serial.println("Usage: wifi-set <ssid> <password>");
    return;
  }
  strlcpy(ssid, args, min((size_t)(space - args + 1), sizeof(ssid)));
  strlcpy(password, space + 1, sizeof(password));

  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("password", password);
  prefs.end();

  Serial.printf("WiFi credentials saved for '%s'. Reboot to connect.\r\n", ssid);
}

void CLI::cmdWifiStatus() {
  if (WiFi.isConnected()) {
    Serial.printf("Connected to: %s\r\n", WiFi.SSID().c_str());
    Serial.printf("IP Address:   %s\r\n", WiFi.localIP().toString().c_str());
    Serial.printf("Signal:       %d dBm\r\n", WiFi.RSSI());
  } else {
    Serial.println("Not connected");
    Preferences prefs;
    prefs.begin("wifi", true);
    String ssid = prefs.getString("ssid", "");
    prefs.end();
    if (ssid.length() > 0) {
      Serial.printf("Saved SSID: %s\r\n", ssid.c_str());
    } else {
      Serial.println("No credentials saved");
    }
  }
}

void CLI::cmdReboot() {
  Serial.println("Rebooting...");
  delay(500);
  ESP.restart();
}
