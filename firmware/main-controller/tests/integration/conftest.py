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

    return API()

@pytest.fixture(autouse=True)
def stop_all_zones(api):
    """Ensure all zones are stopped before and after every test."""
    api.post("/zones/stop-all")
    yield
    api.post("/zones/stop-all")
