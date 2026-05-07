"""Tests for PUT /api/zones/:id (zone name updates)"""
import pytest
import requests


def test_rename_zone_returns_ok(api):
    result = api.put("/zones/1", json={"name": "Front Lawn"})
    assert result.get("ok") is True


def test_rename_zone_persists(api):
    api.put("/zones/1", json={"name": "Front Lawn"})
    zone = api.get("/zones/1")
    assert zone["name"] == "Front Lawn"


def test_rename_zone_while_running(api):
    api.post("/zones/1/start", json={"duration": 60})
    api.put("/zones/1", json={"name": "Back Yard"})
    zone = api.get("/zones/1")
    assert zone["name"] == "Back Yard"
    assert zone["status"] == "running"


def test_rename_zone_visible_in_all_zones(api):
    api.put("/zones/2", json={"name": "Side Gate"})
    zones = api.get("/zones")
    zone2 = next(z for z in zones if z["id"] == 2)
    assert zone2["name"] == "Side Gate"


def test_rename_invalid_zone_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.put("/zones/99", json={"name": "Ghost Zone"})
    assert exc.value.response.status_code == 404


def test_rename_missing_name_returns_400(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.put("/zones/1", json={"duration": 60})
    assert exc.value.response.status_code == 400
