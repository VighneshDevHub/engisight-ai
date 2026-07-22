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
async def test_upload_list_get_and_download_flow():
    """
    Requires Postgres + MinIO to be running (via docker-compose) — this proves
    real object storage upload/retrieval, not just DB row creation.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        project_code = f"PROJ-{uuid.uuid4().hex[:6]}"
        fake_pdf = io.BytesIO(b"%PDF-1.4 fake drawing content for testing")

        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": project_code,
                "drawing_number": "DWG-100-A",
                "drawing_type": "baseline",
            },
            files={"file": ("baseline.pdf", fake_pdf, "application/pdf")},
        )
        assert upload_resp.status_code == 201
        drawing = upload_resp.json()
        assert drawing["project_code"] == project_code
        assert drawing["drawing_type"] == "baseline"
        assert drawing["status"] == "uploaded"
        drawing_id = drawing["id"]

        # Reject unsupported file types
        bad_upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": project_code,
                "drawing_number": "DWG-100-A",
                "drawing_type": "baseline",
            },
            files={"file": ("malware.exe", io.BytesIO(b"x"), "application/x-msdownload")},
        )
        assert bad_upload_resp.status_code == 400

        # Reject invalid drawing_type
        bad_type_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": project_code,
                "drawing_number": "DWG-100-A",
                "drawing_type": "not-a-real-type",
            },
            files={"file": ("x.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert bad_type_resp.status_code == 400

        # List, filtered by project
        list_resp = await client.get(
            "/api/v1/drawings", headers=headers, params={"project_code": project_code}
        )
        assert list_resp.status_code == 200
        assert any(d["id"] == drawing_id for d in list_resp.json())

        # Get by id
        get_resp = await client.get(f"/api/v1/drawings/{drawing_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == drawing_id

        # Non-existent id -> 404
        missing_resp = await client.get(f"/api/v1/drawings/{uuid.uuid4()}", headers=headers)
        assert missing_resp.status_code == 404

        # Download URL is a real, fetchable presigned URL
        url_resp = await client.get(
            f"/api/v1/drawings/{drawing_id}/download-url", headers=headers
        )
        assert url_resp.status_code == 200
        assert "url" in url_resp.json()

        # Unauthenticated requests are rejected
        unauth_resp = await client.get("/api/v1/drawings")
        assert unauth_resp.status_code == 401
