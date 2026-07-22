import io
import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


async def _register_login_and_upload(client: AsyncClient) -> tuple[str, str]:
    email = _unique_email()
    password = "SuperSecret123"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": "Test Engineer", "password": password},
    )
    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    upload_resp = await client.post(
        "/api/v1/drawings/upload",
        headers=headers,
        data={
            "project_code": f"PROJ-{uuid.uuid4().hex[:6]}",
            "drawing_number": "DWG-100-A",
            "drawing_type": "baseline",
        },
        files={"file": ("baseline.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )
    return token, upload_resp.json()["id"]


@pytest.mark.asyncio
async def test_trigger_extraction_enqueues_task_and_sets_processing():
    """
    Mocks celery_app.send_task so this test verifies the API contract
    (202 response, status flips to "processing", task_id returned) without
    actually needing Groq/PaddleOCR/YOLO to run — those are exercised by
    manual end-to-end testing per the README, since they need real credentials
    and model downloads that don't belong in a fast unit test suite.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token, drawing_id = await _register_login_and_upload(client)
        headers = {"Authorization": f"Bearer {token}"}

        with patch("app.api.v1.endpoints.drawings.celery_app.send_task") as mock_send_task:
            mock_send_task.return_value.id = "fake-task-id"

            trigger_resp = await client.post(
                f"/api/v1/drawings/{drawing_id}/extract", headers=headers
            )
            assert trigger_resp.status_code == 202
            body = trigger_resp.json()
            assert body["task_id"] == "fake-task-id"
            assert body["status"] == "processing"
            mock_send_task.assert_called_once_with(
                "app.workers.tasks.extract_drawing_parameters", args=[drawing_id]
            )

        # Drawing status was updated even though the task itself is mocked
        get_resp = await client.get(f"/api/v1/drawings/{drawing_id}", headers=headers)
        assert get_resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_extraction_trigger_requires_existing_drawing():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token, _ = await _register_login_and_upload(client)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.post(f"/api/v1/drawings/{uuid.uuid4()}/extract", headers=headers)
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_parameters_empty_before_extraction():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token, drawing_id = await _register_login_and_upload(client)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.get(f"/api/v1/drawings/{drawing_id}/parameters", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []
