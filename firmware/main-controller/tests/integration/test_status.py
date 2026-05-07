"""Tests for GET /api/status"""


def test_status_returns_expected_fields(api):
    data = api.get("/status")
    assert "device" in data
    assert "firmware" in data
    assert "ip" in data
    assert "uptime_seconds" in data
    assert "zones_running" in data


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
