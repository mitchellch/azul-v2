#include "CLI.h"
#include "version.h"
#include "Logger.h"
#include <WiFi.h>
#include <Preferences.h>
#include <nvs.h>

static uint8_t commonPrefixLen(const char** matches, uint8_t count) {
  if (count == 0) return 0;
  uint8_t len = strlen(matches[0]);
  for (uint8_t i = 1; i < count; i++) {
    uint8_t j = 0;
    while (j < len && matches[0][j] == matches[i][j]) j++;
    len = j;
  }
  return len;
}

static CLI* s_instance = nullptr;
static void reprintPrompt() {
  if (s_instance) s_instance->printPrompt();
}

CLI::CLI(ZoneController& zones, Scheduler& scheduler, AuditLog& audit,
         TimeManager& time, ZoneQueue& queue)
  : _zones(zones), _scheduler(scheduler), _audit(audit), _time(time), _queue(queue), _bufLen(0),
    _historyCount(0), _historyHead(0), _historyPos(-1),
    _escState(0) {
  memset(_buf, 0, sizeof(_buf));
  memset(_history, 0, sizeof(_history));
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
  if (_bufLen > 0) Serial.print(_buf);
}

void CLI::clearInputLine() {
  // Move to start of line, overwrite with spaces, move back
  for (uint8_t i = 0; i < _bufLen + 2; i++) Serial.print("\b");
  for (uint8_t i = 0; i < _bufLen + 2; i++) Serial.print(" ");
  for (uint8_t i = 0; i < _bufLen + 2; i++) Serial.print("\b");
  Serial.print("> ");
}

void CLI::historyPush(const char* line) {
  // Don't store blank lines or duplicates of the most recent entry
  if (strlen(line) == 0) return;
  if (_historyCount > 0 && strcmp(_history[_historyHead], line) == 0) return;

  _historyHead = (_historyHead + 1) % HISTORY_SIZE;
  strlcpy(_history[_historyHead], line, sizeof(_history[0]));
  if (_historyCount < HISTORY_SIZE) _historyCount++;
}

void CLI::historyLoad(int8_t pos) {
  // pos 0 = most recent, 1 = one before, etc.
  uint8_t idx = (_historyHead - pos + HISTORY_SIZE) % HISTORY_SIZE;
  clearInputLine();
  strlcpy(_buf, _history[idx], sizeof(_buf));
  _bufLen = strlen(_buf);
  Serial.print(_buf);
}

void CLI::poll() {
  while (Serial.available()) {
    char c = Serial.read();

    // Escape sequence state machine for arrow keys
    if (_escState == 1) {
      if (c == '[') { _escState = 2; continue; }
      _escState = 0;
    }
    if (_escState == 2) {
      _escState = 0;
      if (c == 'A' && _historyCount > 0) {
        // Up arrow — go back in history
        int8_t next = _historyPos + 1;
        if (next < (int8_t)_historyCount) {
          _historyPos = next;
          historyLoad(_historyPos);
        }
      } else if (c == 'B') {
        // Down arrow — go forward in history
        if (_historyPos > 0) {
          _historyPos--;
          historyLoad(_historyPos);
        } else if (_historyPos == 0) {
          // Back to empty prompt
          _historyPos = -1;
          clearInputLine();
          _bufLen = 0;
          memset(_buf, 0, sizeof(_buf));
        }
      }
      continue;
    }
    if (c == 0x1B) { // ESC
      _escState = 1;
      continue;
    }

    if (c == '\r') continue;

    // Ctrl-U — kill line
    if (c == 0x15) {
      if (_bufLen > 0) {
        clearInputLine();
        _bufLen = 0;
        memset(_buf, 0, sizeof(_buf));
        _historyPos = -1;
      }
      continue;
    }

    if (c == '\t') { cmdComplete(); continue; }

    if (c == '\n') {
      _buf[_bufLen] = '\0';

      if (_bufLen > 0) {
        const char* matches[10];
        uint8_t matchCount = findMatches(matches, 10);
        uint8_t prefixLen = commonPrefixLen(matches, matchCount);

        // Check for an exact match first — "stop" should execute even though
        // "stop-all" also starts with "stop"
        bool exactMatch = false;
        for (uint8_t i = 0; i < matchCount; i++) {
          if (strcmp(matches[i], _buf) == 0) { exactMatch = true; break; }
        }

        if (exactMatch || matchCount == 1) {
          // Exact or unique match — complete (if needed) and execute
          if (matchCount == 1) {
            strlcpy(_buf, matches[0], sizeof(_buf));
            _bufLen = strlen(_buf);
          }
          Serial.println();
          historyPush(_buf);
          dispatch(_buf);
          _historyPos = -1;
          Serial.print("> ");
          _bufLen = 0;
          memset(_buf, 0, sizeof(_buf));
          return;
        } else if (matchCount > 1) {
          // Ambiguous — extend if possible, then show options and stay at prompt
          if (prefixLen > _bufLen) {
            strlcpy(_buf, matches[0], prefixLen + 1);
            _bufLen = prefixLen;
          }
          Serial.println();
          for (uint8_t i = 0; i < matchCount; i++)
            Serial.printf("  %s\r\n", matches[i]);
          printPrompt();
          return;
        }
        // No match — execute as typed (will produce "Unknown command")
        Serial.println();
        historyPush(_buf);
        dispatch(_buf);
      } else {
        Serial.println();
      }

      _historyPos = -1;
      Serial.print("> ");
      _bufLen = 0;
      memset(_buf, 0, sizeof(_buf));
      return;
    }

    // Backspace
    if (c == 0x7F || c == '\b') {
      if (_bufLen > 0) {
        _bufLen--;
        _buf[_bufLen] = '\0';
        Serial.print("\b \b");
        _historyPos = -1;
      }
      continue;
    }

    // Any printable character resets history browsing
    _historyPos = -1;

    if (_bufLen < sizeof(_buf) - 1) {
      _buf[_bufLen++] = c;
      Serial.print(c);
    }
  }
}

// Returns the number of commands that match _buf as a prefix, populates matches[].
uint8_t CLI::findMatches(const char** matches, uint8_t maxMatches) {
  static const char* cmds[] = {
    "help", "status", "zones", "start", "stop", "stop-all",
    "wifi-set", "wifi-status", "version",
    "schedule", "schedules", "log",
    "tz-get", "tz-set", "nvs-dump", "reboot"
  };
  static const uint8_t cmdCount = sizeof(cmds) / sizeof(cmds[0]);

  uint8_t count = 0;
  for (uint8_t i = 0; i < cmdCount && count < maxMatches; i++) {
    if (strncmp(cmds[i], _buf, _bufLen) == 0)
      matches[count++] = cmds[i];
  }
  return count;
}

void CLI::cmdComplete() {
  const char* matches[10];
  uint8_t matchCount = findMatches(matches, 10);

  if (matchCount == 0) return;

  // Extend to longest common prefix
  uint8_t prefixLen = commonPrefixLen(matches, matchCount);
  if (prefixLen > _bufLen) {
    clearInputLine();
    strlcpy(_buf, matches[0], prefixLen + 1);
    _bufLen = prefixLen;
    Serial.print(_buf);
  }

  // If still ambiguous, show options
  if (matchCount > 1) {
    Serial.println();
    for (uint8_t i = 0; i < matchCount; i++)
      Serial.printf("  %s\r\n", matches[i]);
    printPrompt();
  }
}

void CLI::dispatch(const char* line) {
  char cmd[32] = {0};
  char args[96] = {0};

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
  else if (strcmp(cmd, "schedule")    == 0) cmdSchedule();
  else if (strcmp(cmd, "schedules")   == 0) cmdSchedules();
  else if (strcmp(cmd, "log")         == 0) cmdLog(args);
  else if (strcmp(cmd, "tz-get")      == 0) cmdTzGet();
  else if (strcmp(cmd, "tz-set")      == 0) cmdTzSet(args);
  else if (strcmp(cmd, "nvs-dump")    == 0) cmdNvsDump();
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
  Serial.println("  Up/Down arrows            Browse command history");
  Serial.println("  schedule                  Show active schedule");
  Serial.println("  schedules                 List all stored schedules");
  Serial.println("  log [N]                   Show last N audit entries (default 20)");
  Serial.println("  tz-get                    Show current timezone");
  Serial.println("  tz-set <+/-HH:MM>         Set timezone offset (e.g. tz-set -07:00)");
  Serial.println("  nvs-dump                  Dump all NVS config (password masked)");
  Serial.println("  TAB                       Complete or list matching commands");
  Serial.println("  Ctrl-U                    Clear current line");
}

void CLI::cmdStatus() {
  float tempC = temperatureRead();

  // Memory
  uint32_t freeHeap  = ESP.getFreeHeap();
  uint32_t totalHeap = ESP.getHeapSize();
  uint32_t usedHeap  = totalHeap - freeHeap;

  Serial.printf("Firmware:      %s\r\n", fwVersionFull().c_str());
  Serial.printf("Uptime:        %lu seconds\r\n", millis() / 1000);
  Serial.printf("Temperature:   %.1f C / %.1f F\r\n", tempC, tempC * 9.0f / 5.0f + 32.0f);
  if (WiFi.isConnected()) {
    Serial.printf("WiFi:          %s (%s)\r\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  } else {
    Serial.printf("WiFi:          disconnected\r\n");
  }
  Serial.printf("MAC:           %s\r\n", WiFi.macAddress().c_str());
  if (_scheduler.isTimeSynced()) {
    struct tm t;
    if (_time.getLocalTime(t)) {
      char timeBuf[32], offset[7];
      strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", &t);
      _time.formatOffset(offset);
      if (_time.getTzName()[0] != '\0') {
        Serial.printf("Date/Time:     %s %s (%s)\r\n", timeBuf, offset, _time.getTzName());
      } else {
        Serial.printf("Date/Time:     %s %s\r\n", timeBuf, offset);
      }
    }
    Serial.printf("NTP:           synced\r\n");
  } else {
    Serial.printf("NTP:           not synced\r\n");
  }
  Serial.printf("RAM:           %lu used (%lu%%) / %lu total / %lu free (%lu%%)\r\n",
                usedHeap, usedHeap * 100 / totalHeap,
                totalHeap,
                freeHeap, freeHeap * 100 / totalHeap);

  nvs_stats_t nvsStats;
  if (nvs_get_stats(NULL, &nvsStats) == ESP_OK) {
    uint32_t usedPct = nvsStats.used_entries * 100 / nvsStats.total_entries;
    uint32_t freePct = nvsStats.free_entries * 100 / nvsStats.total_entries;
    Serial.printf("NVS:           %d used (%lu%%) / %d total / %d free (%lu%%)\r\n",
                  nvsStats.used_entries,  usedPct,
                  nvsStats.total_entries,
                  nvsStats.free_entries,  freePct);
  }

  const Schedule* active = _scheduler.getActiveSchedule();
  if (active && !_scheduler.isKeepaliveActive()) {
    Serial.printf("Schedule:      %s\r\n", active->name);
  } else if (_scheduler.isKeepaliveActive()) {
    Serial.printf("Schedule:      none [keepalive active — data may be corrupt]\r\n");
  } else {
    Serial.printf("Schedule:      none (use POST /api/schedules to create one)\r\n");
  }

  Serial.printf("Zones running: %s\r\n", _zones.isAnyZoneRunning() ? "yes" : "none");
}

void CLI::cmdVersion() {
  Serial.printf("Firmware:  %s\r\n", fwVersionFull().c_str());
  Serial.printf("Version:   %d.%d.%d\r\n", FW_VERSION_MAJOR, FW_VERSION_MINOR, FW_VERSION_PATCH);
  Serial.printf("Git SHA:   %s%s\r\n", FW_GIT_SHA, FW_GIT_DIRTY ? " (dirty)" : "");
  Serial.printf("Built:     %s %s\r\n", FW_BUILD_DATE, FW_BUILD_TIME);
}

void CLI::cmdZones() {
  // Build a lookup of queued zones
  QueueEntry pending[ZONE_QUEUE_DEPTH];
  uint8_t pendingCount = _queue.getPending(pending, ZONE_QUEUE_DEPTH);

  Serial.println("ID  Name                     Status    Remaining");
  Serial.println("--  -----------------------  --------  ---------");
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    const char* status = "idle";
    uint32_t remaining = 0;

    if (z->status == ZoneStatus::RUNNING) {
      status = "running";
      remaining = z->runtimeSeconds;
    } else {
      // Check if queued
      for (uint8_t q = 0; q < pendingCount; q++) {
        if (pending[q].zoneId == z->id) {
          status = "queued";
          remaining = pending[q].durationSeconds;
          break;
        }
      }
    }
    Serial.printf("%-3d %-24s %-9s %lu s\r\n",
                  z->id, z->name, status, remaining);
  }
  if (pendingCount > 0) {
    Serial.printf("Queue: %d pending\r\n", pendingCount);
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
  if (!_zones.getZone(zoneId)) {
    Serial.printf("Invalid zone ID: %d\r\n", zoneId);
    return;
  }
  bool wasRunning = _zones.isAnyZoneRunning();
  if (_queue.enqueue(zoneId, (uint16_t)duration, AuditSource::MANUAL_CLI)) {
    if (wasRunning) {
      Serial.printf("Zone %d queued (%d waiting)\r\n", zoneId, _queue.count());
    } else {
      Serial.printf("Zone %d started for %lu seconds\r\n", zoneId, duration);
    }
  } else {
    Serial.println("Queue full");
  }
}

void CLI::cmdStop(const char* args) {
  uint8_t zoneId = atoi(args);
  if (zoneId == 0) { Serial.println("Usage: stop <zone_id>"); return; }
  if (_queue.cancel(zoneId)) {
    Serial.printf("Zone %d stopped/dequeued\r\n", zoneId);
  } else {
    Serial.printf("Zone %d not running or queued\r\n", zoneId);
  }
}

void CLI::cmdStopAll() {
  _queue.cancelAll();
  Serial.println("All zones stopped and queue cleared");
}

void CLI::cmdWifiSet(const char* args) {
  char ssid[64] = {0};
  char password[64] = {0};

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

void CLI::cmdSchedule() {
  const Schedule* s = _scheduler.getActiveSchedule();
  if (!s) { Serial.println("No active schedule"); return; }

  char startBuf[11], endBuf[11];
  TimeManager::daysToIsoDate(s->startDate, startBuf);
  if (s->endDate == 0xFFFFFFFF) {
    strlcpy(endBuf, "open-ended", sizeof(endBuf));
  } else {
    TimeManager::daysToIsoDate(s->endDate, endBuf);
  }

  Serial.printf("Name:     %s%s\r\n", s->name,
                _scheduler.isKeepaliveActive() ? " [KEEPALIVE]" : "");
  Serial.printf("UUID:     %s\r\n", s->uuid);
  Serial.printf("Period:   %s to %s\r\n", startBuf, endBuf);
  Serial.println("Runs:");
  Serial.println("  Zone  Days     Time   Duration");
  Serial.println("  ----  -------  -----  --------");

  static const char* dayNames[] = {"Su","Mo","Tu","We","Th","Fr","Sa"};
  for (uint8_t i = 0; i < s->runCount; i++) {
    const ScheduleRun& r = s->runs[i];
    char days[24] = {0};
    for (uint8_t d = 0; d < 7; d++) {
      if (r.dayMask & (1 << d)) { strcat(days, dayNames[d]); strcat(days, " "); }
    }
    Serial.printf("  %-4d  %-7s  %02d:%02d  %ds\r\n",
                  r.zoneId, days, r.hour, r.minute, r.durationSeconds);
  }
}

void CLI::cmdSchedules() {
  Schedule all[SCHEDULE_RING_SIZE];
  uint8_t count = 0;
  _scheduler.getAllSchedules(all, count);

  if (count == 0) { Serial.println("No schedules stored"); return; }

  char activeUuid[37] = {0};
  const Schedule* active = _scheduler.getActiveSchedule();
  if (active) strlcpy(activeUuid, active->uuid, sizeof(activeUuid));

  Serial.println("UUID                                  Name             Start       End");
  Serial.println("------------------------------------  ---------------  ----------  ----------");
  for (uint8_t i = 0; i < count; i++) {
    char startBuf[11], endBuf[11];
    TimeManager::daysToIsoDate(all[i].startDate, startBuf);
    if (all[i].endDate == 0xFFFFFFFF) {
      strlcpy(endBuf, "open-ended", sizeof(endBuf));
    } else {
      TimeManager::daysToIsoDate(all[i].endDate, endBuf);
    }
    bool isActive = (strcmp(all[i].uuid, activeUuid) == 0);
    Serial.printf("%-36s  %-15s  %-10s  %-10s%s\r\n",
                  all[i].uuid, all[i].name, startBuf, endBuf,
                  isActive ? " *" : "");
  }
}

void CLI::cmdLog(const char* args) {
  uint16_t n = 20;
  if (args && args[0] != '\0') n = atoi(args);
  if (n == 0 || n > AUDIT_RING_SIZE) n = 20;

  AuditEntry entries[AUDIT_RING_SIZE];
  uint16_t count = _audit.getRecent(entries, n);

  if (count == 0) { Serial.println("No log entries"); return; }

  Serial.println("Compact              Zone  Duration  Source");
  Serial.println("-------------------  ----  --------  ------");
  static const char* srcNames[] = {"scheduler","REST","BLE","CLI"};
  for (uint16_t i = 0; i < count; i++) {
    char compact[32];
    AuditLog::formatEntry(entries[i], compact, sizeof(compact));
    uint8_t src = entries[i].source;
    Serial.printf("%-20s %-4d  %-8d  %s\r\n",
                  compact, entries[i].zoneId, entries[i].durationSeconds,
                  (src < 4) ? srcNames[src] : "?");
  }
}

void CLI::cmdNvsDump() {
  NvsDump::printToSerial();
}

void CLI::cmdTzGet() {
  char offset[7];
  _time.formatOffset(offset);
  Serial.printf("Offset:    %s\r\n", offset);
  if (_time.getTzName()[0] != '\0') {
    Serial.printf("Name:      %s\r\n", _time.getTzName());
  }
  Serial.printf("Source:    %s\r\n", _time.isTzManual() ? "manual" : "not set");
}

void CLI::cmdTzSet(const char* args) {
  if (!args || args[0] == '\0') {
    Serial.println("Usage: tz-set <+/-HH:MM>");
    Serial.println("  Examples: tz-set +00:00   (UTC)");
    Serial.println("            tz-set -07:00   (Mountain Standard)");
    Serial.println("            tz-set -06:00   (Mountain Daylight / Central Standard)");
    Serial.println("            tz-set -05:00   (Central Daylight / Eastern Standard)");
    Serial.println("            tz-set +05:30   (India)");
    return;
  }

  int32_t offsetSec = 0;
  if (!TimeManager::parseOffset(args, offsetSec)) {
    Serial.println("Invalid format. Use +HH:MM or -HH:MM (e.g. -07:00)");
    return;
  }

  _time.setTzOffset(offsetSec, 0); // DST=0; user sets total offset inclusive of DST
  char buf[7];
  _time.formatOffset(buf);
  Serial.printf("Timezone set to %s. Reboot to apply to NTP.\r\n", buf);
}

void CLI::cmdReboot() {
  Serial.println("Rebooting...");
  delay(500);
  ESP.restart();
}
