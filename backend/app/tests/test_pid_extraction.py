import io
import uuid
from unittest.mock import patch

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


async def _upload_drawing(client: AsyncClient, headers: dict, drawing_type: str) -> str:
    resp = await client.post(
        "/api/v1/drawings/upload",
        headers=headers,
        data={
            "project_code": f"PROJ-{uuid.uuid4().hex[:6]}",
            "drawing_number": "DWG-1",
            "drawing_type": drawing_type,
        },
        files={"file": (f"{drawing_type}.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_extract_bom_rejects_non_pid_drawing():
    """
    /extract-bom must only operate on drawing_type='pid' drawings — running
    vision-LLM component recognition against a baseline/revision drawing
    (Phase 1's document type) would be a category error.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        baseline_id = await _upload_drawing(client, headers, "baseline")

        resp = await client.post(f"/api/v1/drawings/{baseline_id}/extract-bom", headers=headers)
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_extract_bom_enqueues_task_and_sets_processing():
    """Mocks celery_app.send_task — same pattern as test_extraction.py."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        pid_id = await _upload_drawing(client, headers, "pid")

        with patch("app.api.v1.endpoints.drawings.celery_app.send_task") as mock_send_task:
            mock_send_task.return_value.id = "fake-task-id"

            trigger_resp = await client.post(
                f"/api/v1/drawings/{pid_id}/extract-bom", headers=headers
            )
            assert trigger_resp.status_code == 202
            body = trigger_resp.json()
            assert body["task_id"] == "fake-task-id"
            assert body["status"] == "processing"
            mock_send_task.assert_called_once_with(
                "app.workers.tasks.extract_pid_components", args=[pid_id]
            )

        get_resp = await client.get(f"/api/v1/drawings/{pid_id}", headers=headers)
        assert get_resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_bom_empty_before_extraction():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        pid_id = await _upload_drawing(client, headers, "pid")

        resp = await client.get(f"/api/v1/drawings/{pid_id}/bom", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total_components"] == 0
        assert body["quantity_by_type"] == {}


@pytest.mark.asyncio
async def test_extract_bom_requires_existing_drawing():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post(
            f"/api/v1/drawings/{uuid.uuid4()}/extract-bom", headers=headers
        )
        assert resp.status_code == 404
