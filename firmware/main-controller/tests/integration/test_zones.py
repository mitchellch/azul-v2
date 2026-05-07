"""Tests for GET /api/zones and GET /api/zones/:id"""
import pytest

ZONE_COUNT = 8


def test_get_all_zones_returns_list(api):
    data = api.get("/zones")
    assert isinstance(data, list)


def test_get_all_zones_count(api):
    data = api.get("/zones")
    assert len(data) == ZONE_COUNT


def test_get_all_zones_have_required_fields(api):
    zones = api.get("/zones")
    for zone in zones:
        assert "id" in zone
        assert "name" in zone
        assert "status" in zone
        assert "runtime_seconds" in zone


def test_get_all_zones_ids_are_sequential(api):
    zones = api.get("/zones")
    ids = [z["id"] for z in zones]
    assert ids == list(range(1, ZONE_COUNT + 1))


def test_get_all_zones_all_idle_initially(api):
    zones = api.get("/zones")
    for zone in zones:
        assert zone["status"] == "idle"
        assert zone["runtime_seconds"] == 0


def test_get_single_zone_returns_one_zone(api):
    data = api.get("/zones/1")
    assert isinstance(data, dict)
    assert data["id"] == 1


def test_get_single_zone_correct_id(api):
    for zone_id in [1, 4, 8]:
        data = api.get(f"/zones/{zone_id}")
        assert data["id"] == zone_id


def test_get_single_zone_has_required_fields(api):
    data = api.get("/zones/1")
    assert "id" in data
    assert "name" in data
    assert "status" in data
    assert "runtime_seconds" in data


def test_get_invalid_zone_returns_404(api):
    import requests
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.get("/zones/99")
    assert exc.value.response.status_code == 404
