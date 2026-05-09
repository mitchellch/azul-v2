#include "ScheduleJson.h"
#include <cstring>

void scheduleToJson(const Schedule& s, JsonObject& obj) {
  obj["uuid"] = s.uuid;
  obj["name"] = s.name;
  char dateBuf[11];
  TimeManager::daysToIsoDate(s.startDate, dateBuf);
  obj["start_date"] = dateBuf;
  if (s.endDate == 0xFFFFFFFF) {
    obj["end_date"] = nullptr;
  } else {
    TimeManager::daysToIsoDate(s.endDate, dateBuf);
    obj["end_date"] = dateBuf;
  }
  JsonArray runs = obj["runs"].to<JsonArray>();
  for (uint8_t i = 0; i < s.runCount; i++) {
    const ScheduleRun& r = s.runs[i];
    JsonObject ro = runs.add<JsonObject>();
    ro["zone_id"]          = r.zoneId;
    ro["day_mask"]         = r.dayMask;
    ro["hour"]             = r.hour;
    ro["minute"]           = r.minute;
    ro["duration_seconds"] = r.durationSeconds;
    if (r.intervalDays) ro["interval_days"] = r.intervalDays;
  }
}

bool jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut, size_t errLen) {
  memset(&s, 0, sizeof(s));

  const char* name = body["name"] | "";
  if (!name[0]) { strlcpy(errOut, "name required", errLen); return false; }
  strlcpy(s.name, name, sizeof(s.name));

  const char* startStr = body["start_date"] | "";
  if (strlen(startStr) < 10) { strlcpy(errOut, "start_date required (YYYY-MM-DD)", errLen); return false; }
  s.startDate = TimeManager::isoDateToDays(startStr);

  const char* endStr = body["end_date"] | "";
  s.endDate = (strlen(endStr) >= 10) ? TimeManager::isoDateToDays(endStr) : 0xFFFFFFFF;

  if (s.endDate != 0xFFFFFFFF && s.endDate < s.startDate) {
    strlcpy(errOut, "end_date must be >= start_date", errLen); return false;
  }

  JsonArrayConst runs = body["runs"];
  if (runs.isNull()) { strlcpy(errOut, "runs array required", errLen); return false; }

  s.runCount = 0;
  for (JsonObjectConst r : runs) {
    if (s.runCount >= MAX_RUNS_PER_SCHEDULE) { strlcpy(errOut, "too many runs", errLen); return false; }
    ScheduleRun& sr = s.runs[s.runCount++];
    sr.zoneId          = r["zone_id"]          | 0;
    sr.dayMask         = r["day_mask"]          | DAY_ALL;
    sr.hour            = r["hour"]              | 0;
    sr.minute          = r["minute"]            | 0;
    sr.durationSeconds = r["duration_seconds"]  | 300;
    sr.intervalDays    = r["interval_days"]     | 0;
    if (sr.zoneId < 1 || sr.zoneId > MAX_ZONES) {
      snprintf(errOut, errLen, "invalid zone_id: %d", sr.zoneId);
      return false;
    }
  }
  return true;
}
