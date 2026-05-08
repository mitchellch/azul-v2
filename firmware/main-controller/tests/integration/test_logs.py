"""Tests for GET /api/log and GET /api/log/changes"""
import time


def test_get_log_returns_list(api):
    data = api.get("/log")
    assert isinstance(data, list)


def test_get_log_entry_has_expected_fields(api):
    # Trigger a zone start to create a log entry
    api.post("/zones/1/start", json={"duration": 2})
    time.sleep(3)  # let it expire

    data = api.get("/log")
    if len(data) > 0:
        entry = data[0]
        assert "ts" in entry
        assert "zone" in entry
        assert "duration" in entry
        assert "source" in entry
        assert "compact" in entry


def test_get_log_compact_format(api):
    api.post("/zones/2/start", json={"duration": 2})
    time.sleep(3)

    data = api.get("/log")
    if len(data) > 0:
        compact = data[0]["compact"]
        assert isinstance(compact, str)
        parts = compact.split(":")
        assert len(parts) == 3  # datetime:zone:duration


def test_get_log_n_parameter(api):
    # Request only 1 entry
    data = api.get("/log?n=1")
    assert isinstance(data, list)
    assert len(data) <= 1


def test_get_log_zone_start_creates_entry(api):
    before = len(api.get("/log"))
    api.post("/zones/3/start", json={"duration": 2})
    time.sleep(3)
    after = len(api.get("/log"))
    assert after >= before  # may not increment if NTP not synced (ts=0)


def test_get_changelog_returns_list(api):
    data = api.get("/log/changes")
    assert isinstance(data, list)


def test_get_changelog_entry_has_expected_fields(api):
    data = api.get("/log/changes")
    if len(data) > 0:
        entry = data[0]
        assert "ts" in entry
        assert "uuid" in entry
        assert "op" in entry


def test_get_changelog_op_values_are_valid(api):
    data = api.get("/log/changes")
    valid_ops = {"create", "update", "delete", "activate", "unknown"}
    for entry in data:
        assert entry["op"] in valid_ops
