import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


async def _register_and_login(client: AsyncClient) -> str:
    email = _unique_email()
    password = "SuperSecret123"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": "Test Engineer", "password": password},
    )
    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    return login_resp.json()["access_token"]


@pytest.mark.asyncio
async def test_upload_pid_drawing_type_accepted():
    """
    Phase 2 Step 1: the existing /drawings/upload endpoint (built in Phase 1)
    must now accept drawing_type='pid' without any other changes — proving
    the upload/storage layer is correctly reused rather than duplicated.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": f"PID-{uuid.uuid4().hex[:6]}",
                "drawing_number": "PID-100",
                "drawing_type": "pid",
            },
            files={"file": ("unit_101.pdf", io.BytesIO(b"%PDF-1.4 fake pid"), "application/pdf")},
        )
        assert upload_resp.status_code == 201
        assert upload_resp.json()["drawing_type"] == "pid"

        # baseline/revision must still work — this is a regression check
        # against accidentally breaking Phase 1 while extending the enum
        baseline_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": "PROJ-REGRESSION",
                "drawing_number": "DWG-1",
                "drawing_type": "baseline",
            },
            files={"file": ("b.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert baseline_resp.status_code == 201

        # invalid types are still rejected
        bad_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": "PROJ-X",
                "drawing_number": "DWG-1",
                "drawing_type": "not-a-real-type",
            },
            files={"file": ("x.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert bad_resp.status_code == 400
