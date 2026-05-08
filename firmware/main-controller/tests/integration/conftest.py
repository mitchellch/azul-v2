import pytest
import requests

def pytest_addoption(parser):
    parser.addoption(
        "--host",
        action="store",
        default="192.168.1.207",
        help="IP address of the Azul Main Controller (default: 192.168.1.207)"
    )

@pytest.fixture(scope="session")
def host(request):
    return request.config.getoption("--host")

@pytest.fixture(scope="session")
def base_url(host):
    return f"http://{host}/api"

@pytest.fixture(scope="session")
def api(base_url):
    """Thin wrapper that raises on non-2xx and returns parsed JSON."""
    class API:
        def __init__(self):
            self._base_url = base_url

        def get(self, path, **kwargs):
            r = requests.get(f"{base_url}{path}", timeout=5, **kwargs)
            r.raise_for_status()
            return r.json()

        def post(self, path, **kwargs):
            r = requests.post(f"{base_url}{path}", timeout=5, **kwargs)
            r.raise_for_status()
            return r.json()

        def put(self, path, **kwargs):
            r = requests.put(f"{base_url}{path}", timeout=5, **kwargs)
            r.raise_for_status()
            return r.json()

        def delete(self, path, **kwargs):
            r = requests.delete(f"{base_url}{path}", timeout=5, **kwargs)
            r.raise_for_status()
            return r.json()

        def try_delete(self, path):
            """Delete without raising — used in cleanup."""
            try:
                requests.delete(f"{base_url}{path}", timeout=5)
            except Exception:
                pass

    return API()

@pytest.fixture(autouse=True)
def stop_all_zones(api):
    """Ensure all zones are stopped before and after every test."""
    api.post("/zones/stop-all")
    yield
    api.post("/zones/stop-all")

def _delete_all_schedules(api):
    """Delete all stored schedules."""
    # Deactivate first so deleting the active schedule is allowed
    try:
        api.post("/schedules/deactivate")
    except Exception:
        pass
    schedules = api.get("/schedules")
    for s in schedules:
        api.try_delete(f"/schedules/{s['uuid']}")

@pytest.fixture(autouse=True)
def cleanup_schedules(api):
    """Remove test schedules after each test."""
    yield
    _delete_all_schedules(api)
