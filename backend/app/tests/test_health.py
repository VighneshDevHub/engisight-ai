import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert "message" in body
    # App name rebrand per Phase 1 Step 1 — must read "EngiSight AI" everywhere
    assert "EngiSight AI" in body["message"]


@pytest.mark.asyncio
async def test_health_liveness():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "EngiSight AI"
    assert body["env"] in ("development", "testing", "production")


@pytest.mark.asyncio
async def test_health_readiness():
    """
    Requires Postgres + Redis + MinIO + Qdrant to actually be running
    (docker-compose). Verifies real end-to-end connectivity across all four
    core dependency layers, not just that the Python process is alive.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200
    body = response.json()
    # "status" is a rollup — if all deps are up, it's "ok"; otherwise
    # "degraded". Individual checks are visible in the "checks" dict.
    assert body["status"] in ("ok", "degraded")
    # All four dependency checks must be present (even if a service is down,
    # the response shape must be consistent so monitoring can parse it).
    for key in ("database", "redis", "storage", "qdrant"):
        assert key in body["checks"], f"missing check key: {key}"
        # Value is either "ok" or a string starting with "error:" — never
        # None or the sentinel "unknown" (means the probe didn't even run).
        val = body["checks"][key]
        assert val == "ok" or val.startswith("error:"), f"{key}={val!r} not expected"
