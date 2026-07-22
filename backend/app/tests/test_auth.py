import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


@pytest.mark.asyncio
async def test_register_and_login_flow():
    """
    Requires Postgres to be running (via docker-compose) — this is an
    integration test, not a mock test, because auth correctness (hashing,
    JWT signing/verification, DB uniqueness) must be proven against a real DB.
    """
    email = _unique_email()
    password = "SuperSecret123"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register
        register_resp = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "full_name": "Test Engineer", "password": password},
        )
        assert register_resp.status_code == 201
        body = register_resp.json()
        assert body["email"] == email
        assert body["role"] == "engineer"
        assert "hashed_password" not in body  # never leak the hash

        # Duplicate registration must fail
        dup_resp = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "full_name": "Test Engineer", "password": password},
        )
        assert dup_resp.status_code == 409

        # Login with correct credentials
        login_resp = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": password}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        assert token

        # Login with wrong password must fail
        bad_login_resp = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
        )
        assert bad_login_resp.status_code == 401

        # Access protected /me with valid token
        me_resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == email

        # Access protected /me with no token
        no_token_resp = await client.get("/api/v1/auth/me")
        assert no_token_resp.status_code == 401

        # Access protected /me with garbage token
        bad_token_resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert bad_token_resp.status_code == 401
