"""Tests for zone start/stop/stop-all and timer behaviour"""
import time
import pytest
import requests


def test_start_zone_returns_ok(api):
    result = api.post("/zones/1/start", json={"duration": 60})
    assert result.get("ok") is True


def test_start_zone_sets_status_running(api):
    api.post("/zones/1/start", json={"duration": 60})
    zone = api.get("/zones/1")
    assert zone["status"] == "running"


def test_start_zone_sets_runtime(api):
    api.post("/zones/1/start", json={"duration": 60})
    zone = api.get("/zones/1")
    assert zone["runtime_seconds"] > 0
    assert zone["runtime_seconds"] <= 60


def test_start_zone_runtime_counts_down(api):
    api.post("/zones/1/start", json={"duration": 30})
    first = api.get("/zones/1")["runtime_seconds"]
    time.sleep(2)
    second = api.get("/zones/1")["runtime_seconds"]
    assert second < first


def test_start_zone_default_duration(api):
    # duration is required in our API — verify it accepts explicit value
    api.post("/zones/1/start", json={"duration": 10})
    zone = api.get("/zones/1")
    assert zone["runtime_seconds"] <= 10


def test_start_multiple_zones(api):
    api.post("/zones/1/start", json={"duration": 60})
    api.post("/zones/2/start", json={"duration": 60})
    assert api.get("/zones/1")["status"] == "running"
    assert api.get("/zones/2")["status"] == "running"
    assert api.get("/zones/3")["status"] == "idle"


def test_start_invalid_zone_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/zones/99/start", json={"duration": 60})
    assert exc.value.response.status_code == 404


def test_stop_zone_returns_ok(api):
    api.post("/zones/1/start", json={"duration": 60})
    result = api.post("/zones/1/stop")
    assert result.get("ok") is True


def test_stop_zone_sets_status_idle(api):
    api.post("/zones/1/start", json={"duration": 60})
    api.post("/zones/1/stop")
    zone = api.get("/zones/1")
    assert zone["status"] == "idle"
    assert zone["runtime_seconds"] == 0


def test_stop_idle_zone_is_safe(api):
    # Stopping a zone that isn't running should not error
    result = api.post("/zones/1/stop")
    assert result.get("ok") is True


def test_stop_invalid_zone_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/zones/99/stop")
    assert exc.value.response.status_code == 404


def test_stop_all_returns_ok(api):
    api.post("/zones/1/start", json={"duration": 60})
    api.post("/zones/2/start", json={"duration": 60})
    result = api.post("/zones/stop-all")
    assert result.get("ok") is True


def test_stop_all_clears_all_zones(api):
    api.post("/zones/1/start", json={"duration": 60})
    api.post("/zones/3/start", json={"duration": 60})
    api.post("/zones/5/start", json={"duration": 60})
    api.post("/zones/stop-all")
    zones = api.get("/zones")
    for zone in zones:
        assert zone["status"] == "idle"
        assert zone["runtime_seconds"] == 0


def test_stop_all_updates_zones_running_flag(api):
    api.post("/zones/1/start", json={"duration": 60})
    assert api.get("/status")["zones_running"] is True
    api.post("/zones/stop-all")
    assert api.get("/status")["zones_running"] is False


def test_zone_expires_automatically(api):
    api.post("/zones/1/start", json={"duration": 2})
    time.sleep(3)
    zone = api.get("/zones/1")
    assert zone["status"] == "idle"
    assert zone["runtime_seconds"] == 0
