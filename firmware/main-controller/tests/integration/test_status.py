"""Tests for GET /api/status"""


def test_status_returns_expected_fields(api):
    data = api.get("/status")
    assert "device" in data
    assert "firmware" in data
    assert "build" in data
    assert "ssid" in data
    assert "ip" in data
    assert "mac" in data
    assert "uptime_seconds" in data
    assert "temperature_c" in data
    assert "temperature_f" in data
    assert "ntp_synced" in data
    assert "ram_free" in data
    assert "ram_total" in data
    assert "nvs_used" in data
    assert "nvs_free" in data
    assert "nvs_total" in data
    assert "zones_running" in data


def test_status_mac_format(api):
    mac = api.get("/status")["mac"]
    assert isinstance(mac, str)
    parts = mac.split(":")
    assert len(parts) == 6


def test_status_ram_values_plausible(api):
    data = api.get("/status")
    assert data["ram_total"] > 0
    assert data["ram_free"] > 0
    assert data["ram_free"] < data["ram_total"]


def test_status_nvs_values_plausible(api):
    data = api.get("/status")
    assert data["nvs_total"] > 0
    assert data["nvs_used"] >= 0
    assert data["nvs_free"] >= 0
    assert data["nvs_used"] + data["nvs_free"] <= data["nvs_total"]


def test_status_ntp_synced_is_bool(api):
    data = api.get("/status")
    assert isinstance(data["ntp_synced"], bool)


def test_status_build_timestamp_format(api):
    build = api.get("/status")["build"]
    assert isinstance(build, str)
    assert len(build) > 0
    # Format: "May  7 2026 14:23:01"
    parts = build.split(" ")
    assert len(parts) >= 3


def test_status_temperature_is_plausible(api):
    data = api.get("/status")
    temp_c = data["temperature_c"]
    temp_f = data["temperature_f"]
    assert isinstance(temp_c, (int, float))
    assert isinstance(temp_f, (int, float))
    assert 0 < temp_c < 100
    assert 32 < temp_f < 212


def test_status_temperature_conversion(api):
    data = api.get("/status")
    expected_f = data["temperature_c"] * 9 / 5 + 32
    assert abs(data["temperature_f"] - expected_f) < 0.1


def test_status_ssid_present(api):
    data = api.get("/status")
    assert isinstance(data["ssid"], str)
    assert len(data["ssid"]) > 0


def test_status_device_name(api):
    data = api.get("/status")
    assert data["device"] == "Azul Main Controller"


def test_status_firmware_format(api):
    # Expect semver + sha: "0.1.0-abc1234" or "0.1.0-abc1234-dirty"
    fw = api.get("/status")["firmware"]
    parts = fw.split("-")
    assert len(parts) >= 2
    semver = parts[0]
    assert semver.count(".") == 2


def test_status_uptime_is_positive(api):
    data = api.get("/status")
    assert data["uptime_seconds"] > 0


def test_status_zones_running_is_bool(api):
    data = api.get("/status")
    assert isinstance(data["zones_running"], bool)


def test_status_zones_running_false_when_all_idle(api):
    data = api.get("/status")
    assert data["zones_running"] is False


def test_status_zones_running_true_when_zone_active(api):
    api.post("/zones/1/start", json={"duration": 30})
    data = api.get("/status")
    assert data["zones_running"] is True
