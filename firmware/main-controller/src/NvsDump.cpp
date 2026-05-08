#include "NvsDump.h"
#include "ScheduleModel.h"
#include <Preferences.h>
#include <ArduinoJson.h>
#include <nvs.h>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static String maskPassword(const String& pw) {
    if (pw.length() == 0) return "";
    return String("*").substring(0, 1) + "****" + "*****";
}

struct WifiNvs {
    String ssid;
    String password;
};

static WifiNvs readWifi() {
    Preferences p;
    p.begin("wifi", false);
    WifiNvs w;
    w.ssid     = p.getString("ssid", "");
    w.password = p.getString("password", "");
    p.end();
    return w;
}

struct TimeNvs {
    int32_t tzOffset;
    int32_t tzDst;
    String  tzName;
    bool    tzManual;
};

static TimeNvs readTime() {
    Preferences p;
    p.begin("aztime", false);
    TimeNvs t;
    t.tzOffset = p.getInt("tz_offset", 0);
    t.tzDst    = p.getInt("tz_dst",    0);
    t.tzName   = p.getString("tz_name", "");
    t.tzManual = p.getBool("tz_manual", false);
    p.end();
    return t;
}

struct SchedNvs {
    uint8_t head;
    uint8_t ver;
    String  activeUuid;
    uint8_t slotsUsed;
};

static SchedNvs readSched() {
    Preferences p;
    p.begin("sched", false);
    SchedNvs s;
    s.head       = p.getUChar("head", 0);
    s.ver        = p.getUChar("ver",  0);
    s.activeUuid = p.getString("active", "");

    // Use raw NVS API to check slot existence silently (Preferences logs errors for missing keys)
    static const char* slots[] = {"s0","s1","s2","s3","s4"};
    s.slotsUsed = 0;
    nvs_handle_t nvsh;
    if (nvs_open("sched", NVS_READONLY, &nvsh) == ESP_OK) {
        for (uint8_t i = 0; i < 5; i++) {
            size_t len = sizeof(Schedule);
            Schedule tmp;
            memset(&tmp, 0, sizeof(tmp));
            if (nvs_get_blob(nvsh, slots[i], &tmp, &len) == ESP_OK
                && len == sizeof(Schedule) && tmp.uuid[0] != '\0') {
                s.slotsUsed++;
            }
        }
        nvs_close(nvsh);
    }
    p.end();
    return s;
}

struct RingNvs {
    uint16_t count;
    uint16_t capacity;
};

static RingNvs readAudit() {
    Preferences p;
    p.begin("audit", false);
    RingNvs r;
    r.count    = p.getUShort("count", 0);
    r.capacity = AUDIT_RING_SIZE;
    p.end();
    return r;
}

static RingNvs readChangelog() {
    Preferences p;
    p.begin("chglog", false);
    RingNvs r;
    r.count    = p.getUChar("count", 0);
    r.capacity = CHANGELOG_RING_SIZE;
    p.end();
    return r;
}

// ---------------------------------------------------------------------------
// Serial output
// ---------------------------------------------------------------------------

void NvsDump::printToSerial() {
    auto wifi   = readWifi();
    auto time   = readTime();
    auto sched  = readSched();
    auto audit  = readAudit();
    auto chglog = readChangelog();

    Serial.println("NVS Dump:");
    Serial.println();

    Serial.println("  [wifi]");
    Serial.printf( "    ssid:         %s\r\n", wifi.ssid.length() > 0 ? wifi.ssid.c_str() : "(not set)");
    Serial.printf( "    password:     %s\r\n", wifi.password.length() > 0 ? "********" : "(not set)");

    Serial.println();
    Serial.println("  [aztime]");
    Serial.printf( "    tz_offset:    %d\r\n", time.tzOffset);
    Serial.printf( "    tz_dst:       %d\r\n", time.tzDst);
    Serial.printf( "    tz_name:      %s\r\n", time.tzName.length() > 0 ? time.tzName.c_str() : "(not set)");
    Serial.printf( "    tz_manual:    %s\r\n", time.tzManual ? "true" : "false");

    Serial.println();
    Serial.println("  [sched]");
    Serial.printf( "    head:         %d\r\n", sched.head);
    Serial.printf( "    version:      %d\r\n", sched.ver);
    Serial.printf( "    active_uuid:  %s\r\n", sched.activeUuid.length() > 0 ? sched.activeUuid.c_str() : "(none)");
    Serial.printf( "    slots_used:   %d / 5\r\n", sched.slotsUsed);
    Serial.println("    note: use GET /api/schedules for schedule contents");

    Serial.println();
    Serial.println("  [audit]");
    Serial.printf( "    entries:      %d / %d\r\n", audit.count, audit.capacity);
    Serial.println("    note: use GET /api/log for entries");

    Serial.println();
    Serial.println("  [chglog]");
    Serial.printf( "    entries:      %d / %d\r\n", chglog.count, chglog.capacity);
    Serial.println("    note: use GET /api/log/changes for entries");
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

String NvsDump::toJson() {
    auto wifi   = readWifi();
    auto time   = readTime();
    auto sched  = readSched();
    auto audit  = readAudit();
    auto chglog = readChangelog();

    JsonDocument doc;

    JsonObject wifiObj = doc["wifi"].to<JsonObject>();
    wifiObj["ssid"]     = wifi.ssid.length() > 0 ? wifi.ssid : "";
    wifiObj["password"] = wifi.password.length() > 0 ? "********" : "";

    JsonObject timeObj = doc["aztime"].to<JsonObject>();
    timeObj["tz_offset"] = time.tzOffset;
    timeObj["tz_dst"]    = time.tzDst;
    timeObj["tz_name"]   = time.tzName;
    timeObj["tz_manual"] = time.tzManual;

    JsonObject schedObj = doc["sched"].to<JsonObject>();
    schedObj["head"]        = sched.head;
    schedObj["version"]     = sched.ver;
    schedObj["active_uuid"] = sched.activeUuid;
    schedObj["slots_used"]  = sched.slotsUsed;
    schedObj["slots_total"] = 5;
    schedObj["note"]        = "use GET /api/schedules for schedule contents";

    JsonObject auditObj = doc["audit"].to<JsonObject>();
    auditObj["entries"]  = audit.count;
    auditObj["capacity"] = audit.capacity;
    auditObj["note"]     = "use GET /api/log for entries";

    JsonObject chglogObj = doc["chglog"].to<JsonObject>();
    chglogObj["entries"]  = chglog.count;
    chglogObj["capacity"] = chglog.capacity;
    chglogObj["note"]     = "use GET /api/log/changes for entries";

    String out;
    serializeJsonPretty(doc, out);
    return out;
}
