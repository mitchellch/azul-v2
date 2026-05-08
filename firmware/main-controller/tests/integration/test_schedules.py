"""Tests for schedule CRUD endpoints"""
import pytest
import requests

SAMPLE_SCHEDULE = {
    "name": "Test Summer",
    "start_date": "2026-06-01",
    "end_date": "2026-08-31",
    "runs": [
        {"zone_id": 1, "day_mask": 127, "hour": 7, "minute": 0, "duration_seconds": 300},
        {"zone_id": 2, "day_mask": 42,  "hour": 7, "minute": 6, "duration_seconds": 180},
    ]
}

SAMPLE_SCHEDULE_2 = {
    "name": "Test Autumn",
    "start_date": "2026-09-01",
    "end_date": "2026-11-30",
    "runs": [
        {"zone_id": 1, "day_mask": 127, "hour": 8, "minute": 0, "duration_seconds": 240},
    ]
}


@pytest.fixture
def created_schedule(api):
    """Create a schedule for use in a test. Cleanup handled by cleanup_schedules fixture."""
    result = api.post("/schedules", json=SAMPLE_SCHEDULE)
    yield result["uuid"]


# ---------------------------------------------------------------------------
# GET /api/schedules
# ---------------------------------------------------------------------------

def test_get_schedules_returns_list(api):
    data = api.get("/schedules")
    assert isinstance(data, list)


def test_get_schedules_empty_initially(api):
    data = api.get("/schedules")
    assert len(data) == 0


# ---------------------------------------------------------------------------
# POST /api/schedules
# ---------------------------------------------------------------------------

def test_create_schedule_returns_uuid(api, created_schedule):
    assert created_schedule is not None
    assert len(created_schedule) == 36
    assert created_schedule.count("-") == 4


def test_create_schedule_appears_in_list(api, created_schedule):
    schedules = api.get("/schedules")
    uuids = [s["uuid"] for s in schedules]
    assert created_schedule in uuids


def test_create_schedule_returns_201(api):
    import requests as req
    r = req.post(f"http://{api._base_url.split('http://')[1]}/schedules",
                 json=SAMPLE_SCHEDULE, timeout=5)
    # Clean up
    if r.status_code == 201:
        uuid = r.json().get("uuid")
        if uuid:
            api.delete(f"/schedules/{uuid}")


def test_create_schedule_missing_name_returns_400(api):
    bad = {**SAMPLE_SCHEDULE}
    del bad["name"]
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/schedules", json=bad)
    assert exc.value.response.status_code == 400


def test_create_schedule_missing_runs_returns_400(api):
    bad = {**SAMPLE_SCHEDULE}
    del bad["runs"]
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/schedules", json=bad)
    assert exc.value.response.status_code == 400


def test_create_schedule_invalid_zone_id_returns_400(api):
    bad = {
        **SAMPLE_SCHEDULE,
        "runs": [{"zone_id": 99, "day_mask": 127, "hour": 6, "minute": 0, "duration_seconds": 300}]
    }
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/schedules", json=bad)
    assert exc.value.response.status_code == 400


def test_create_overlapping_schedule_returns_409(api, created_schedule):
    # Same date range should conflict
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/schedules", json=SAMPLE_SCHEDULE)
    assert exc.value.response.status_code == 409


# ---------------------------------------------------------------------------
# GET /api/schedules/:id
# ---------------------------------------------------------------------------

def test_get_schedule_by_uuid(api, created_schedule):
    data = api.get(f"/schedules/{created_schedule}")
    assert data["uuid"] == created_schedule
    assert data["name"] == SAMPLE_SCHEDULE["name"]


def test_get_schedule_has_runs(api, created_schedule):
    data = api.get(f"/schedules/{created_schedule}")
    assert "runs" in data
    assert len(data["runs"]) == len(SAMPLE_SCHEDULE["runs"])


def test_get_schedule_has_dates(api, created_schedule):
    data = api.get(f"/schedules/{created_schedule}")
    assert data["start_date"] == SAMPLE_SCHEDULE["start_date"]
    assert data["end_date"] == SAMPLE_SCHEDULE["end_date"]


def test_get_invalid_schedule_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.get("/schedules/00000000-0000-0000-0000-000000000001")
    assert exc.value.response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/schedules/:id
# ---------------------------------------------------------------------------

def test_update_schedule_name(api, created_schedule):
    updated = {**SAMPLE_SCHEDULE, "name": "Updated Name"}
    result = api.put(f"/schedules/{created_schedule}", json=updated)
    assert result.get("ok") is True

    data = api.get(f"/schedules/{created_schedule}")
    assert data["name"] == "Updated Name"


def test_update_nonexistent_schedule_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.put("/schedules/00000000-0000-0000-0000-000000000001", json=SAMPLE_SCHEDULE)
    assert exc.value.response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/schedules/:id
# ---------------------------------------------------------------------------

def test_delete_schedule(api):
    result = api.post("/schedules", json=SAMPLE_SCHEDULE)
    uuid = result["uuid"]

    del_result = api.delete(f"/schedules/{uuid}")
    assert del_result.get("ok") is True

    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.get(f"/schedules/{uuid}")
    assert exc.value.response.status_code == 404


def test_delete_nonexistent_schedule_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.delete("/schedules/00000000-0000-0000-0000-000000000001")
    assert exc.value.response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/schedules/:id/activate
# ---------------------------------------------------------------------------

def test_activate_schedule(api, created_schedule):
    result = api.post(f"/schedules/{created_schedule}/activate")
    assert result.get("ok") is True


def test_activate_nonexistent_returns_404(api):
    with pytest.raises(requests.exceptions.HTTPError) as exc:
        api.post("/schedules/00000000-0000-0000-0000-000000000001/activate")
    assert exc.value.response.status_code == 404


def test_activate_and_active_schedule_full_lifecycle(api):
    """Create, activate, verify active, delete — all in one test to avoid
    cleanup fixture deactivating the schedule between assertions."""
    result = api.post("/schedules", json=SAMPLE_SCHEDULE)
    uuid = result["uuid"]
    try:
        # Activate
        api.post(f"/schedules/{uuid}/activate")

        # Verify active endpoint
        active = api.get("/schedules/active")
        assert active["uuid"] == uuid
        assert "name" in active
        assert "runs" in active
        assert "is_keepalive" in active
        assert active["is_keepalive"] is False

        # Delete active — should auto-deactivate and delete
        del_result = api.delete(f"/schedules/{uuid}")
        assert del_result.get("ok") is True
        schedules = api.get("/schedules")
        assert uuid not in [s["uuid"] for s in schedules]
        uuid = None  # already deleted

    finally:
        if uuid:
            api.try_delete(f"/schedules/{uuid}")
