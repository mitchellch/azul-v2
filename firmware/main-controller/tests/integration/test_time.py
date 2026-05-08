"""Tests for GET /api/time and PUT /api/time"""
import pytest
import requests


def test_get_time_returns_expected_fields(api):
    data = api.get("/time")
    assert "epoch" in data
    assert "synced" in data
    assert "tz_offset" in data
    assert "tz_dst" in data
    assert "tz_offset_str" in data
    assert "tz_name" in data
    assert "tz_manual" in data


def test_get_time_synced_is_bool(api):
    data = api.get("/time")
    assert isinstance(data["synced"], bool)


def test_get_time_tz_manual_is_bool(api):
    data = api.get("/time")
    assert isinstance(data["tz_manual"], bool)


def test_get_time_tz_offset_str_format(api):
    data = api.get("/time")
    s = data["tz_offset_str"]
    assert isinstance(s, str)
    assert s[0] in ('+', '-')
    assert ':' in s


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

    # Set a new offset
    result = api.put("/time", json={"tz_offset": -18000, "tz_dst": 0})
    assert result.get("ok") is True

    # Verify offset persisted
    data = api.get("/time")
    assert data["tz_offset"] == -18000
    assert data["tz_dst"] == 0

    # Restore original
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"]
    })


def test_set_time_marks_as_manual(api):
    original = api.get("/time")

    api.put("/time", json={"tz_offset": -25200, "tz_dst": 0})
    data = api.get("/time")
    assert data["tz_manual"] is True
    assert data["tz_offset"] == -25200

    # Restore
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"]
    })


def test_set_time_offset_str_matches_offset(api):
    original = api.get("/time")

    api.put("/time", json={"tz_offset": -25200, "tz_dst": 0})  # -07:00
    data = api.get("/time")
    assert data["tz_offset_str"] == "-07:00"

    # Restore
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"]
    })


def test_set_time_with_tz_name(api):
    original = api.get("/time")

    api.put("/time", json={
        "tz_offset": -25200,
        "tz_dst": 0,
        "tz_name": "America/Los_Angeles"
    })
    data = api.get("/time")
    assert data["tz_offset"] == -25200
    assert data["tz_name"] == "America/Los_Angeles"
    assert data["tz_manual"] is True

    # Restore
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"],
        "tz_name": original.get("tz_name", "")
    })


def test_set_time_missing_fields_uses_zero(api):
    original = api.get("/time")

    result = api.put("/time", json={"tz_offset": 0, "tz_dst": 0})
    assert result.get("ok") is True

    # Restore
    api.put("/time", json={
        "tz_offset": original["tz_offset"],
        "tz_dst": original["tz_dst"]
    })
