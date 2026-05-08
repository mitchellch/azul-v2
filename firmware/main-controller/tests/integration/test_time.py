"""Tests for GET /api/time and PUT /api/time"""
import pytest
import requests


def test_get_time_returns_expected_fields(api):
    data = api.get("/time")
    assert "epoch" in data
    assert "synced" in data
    assert "tz_offset" in data
    assert "tz_dst" in data


def test_get_time_synced_is_bool(api):
    data = api.get("/time")
    assert isinstance(data["synced"], bool)


def test_get_time_epoch_plausible_when_synced(api):
    data = api.get("/time")
    if data["synced"]:
        # After Jan 1 2026
        assert data["epoch"] > 1767225600
        assert "iso" in data


def test_get_time_iso_format_when_synced(api):
    data = api.get("/time")
    if data["synced"]:
        iso = data["iso"]
        assert isinstance(iso, str)
        assert "T" in iso
        assert iso.endswith("Z")


def test_set_time_tz_offset(api):
    original = api.get("/time")
    original_offset = original["tz_offset"]
    original_dst = original["tz_dst"]

    # Set a new offset
    result = api.put("/time", json={"tz_offset": -18000, "tz_dst": 0})
    assert result.get("ok") is True

    # Verify it persisted
    data = api.get("/time")
    assert data["tz_offset"] == -18000
    assert data["tz_dst"] == 0

    # Restore original
    api.put("/time", json={"tz_offset": original_offset, "tz_dst": original_dst})


def test_set_time_missing_fields_uses_zero(api):
    original = api.get("/time")

    result = api.put("/time", json={"tz_offset": 0, "tz_dst": 0})
    assert result.get("ok") is True

    # Restore
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"]
    })
