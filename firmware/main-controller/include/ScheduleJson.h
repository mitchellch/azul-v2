#pragma once
#include <ArduinoJson.h>
#include "ScheduleModel.h"
#include "TimeManager.h"

void scheduleToJson(const Schedule& s, JsonObject& obj);
bool jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut, size_t errLen);
