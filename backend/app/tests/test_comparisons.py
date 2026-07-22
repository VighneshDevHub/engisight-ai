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


async def _upload_drawing(client: AsyncClient, headers: dict, project_code: str, drawing_type: str) -> str:
    resp = await client.post(
        "/api/v1/drawings/upload",
        headers=headers,
        data={
            "project_code": project_code,
            "drawing_number": "DWG-100-A",
            "drawing_type": drawing_type,
        },
        files={"file": (f"{drawing_type}.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
    )
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_comparison_rejects_unprocessed_drawings():
    """
    Freshly uploaded drawings have status='uploaded', not 'processed' — the
    comparison endpoint must reject creating a comparison until extraction
    has actually completed on both sides.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project_code = f"PROJ-{uuid.uuid4().hex[:6]}"

        baseline_id = await _upload_drawing(client, headers, project_code, "baseline")
        revision_id = await _upload_drawing(client, headers, project_code, "revision")

        resp = await client.post(
            "/api/v1/comparisons",
            headers=headers,
            json={"baseline_drawing_id": baseline_id, "revision_drawing_id": revision_id},
        )
        assert resp.status_code == 409


@pytest.mark.asyncio
async def test_comparison_rejects_wrong_drawing_types():
    """Swapping baseline/revision drawing_type in the request must be rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project_code = f"PROJ-{uuid.uuid4().hex[:6]}"

        baseline_id = await _upload_drawing(client, headers, project_code, "baseline")
        revision_id = await _upload_drawing(client, headers, project_code, "revision")

        # Note: baseline_drawing_id points at the revision-typed drawing — invalid
        resp = await client.post(
            "/api/v1/comparisons",
            headers=headers,
            json={"baseline_drawing_id": revision_id, "revision_drawing_id": baseline_id},
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_comparison_creation_and_retrieval_with_mocked_processing():
    """
    Mocks celery_app.send_task (same pattern as test_extraction.py) so this
    verifies the API contract without needing a real worker + Qdrant + Groq
    run. Manually sets both drawings to 'processed' to simulate extraction
    having already completed, since that's a Step 4 concern being tested there.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project_code = f"PROJ-{uuid.uuid4().hex[:6]}"

        baseline_id = await _upload_drawing(client, headers, project_code, "baseline")
        revision_id = await _upload_drawing(client, headers, project_code, "revision")

        # Simulate Step 4 extraction having completed by directly flipping status
        # via the DB session used by the app (test-only shortcut).
        from app.db.session import AsyncSessionLocal
        from app.models.drawing import Drawing
        from sqlalchemy import update

        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Drawing).where(Drawing.id == baseline_id).values(status="processed")
            )
            await db.execute(
                update(Drawing).where(Drawing.id == revision_id).values(status="processed")
            )
            await db.commit()

        with patch("app.api.v1.endpoints.comparisons.celery_app.send_task") as mock_send_task:
            mock_send_task.return_value.id = "fake-task-id"

            create_resp = await client.post(
                "/api/v1/comparisons",
                headers=headers,
                json={"baseline_drawing_id": baseline_id, "revision_drawing_id": revision_id},
            )
            assert create_resp.status_code == 202
            comparison = create_resp.json()
            assert comparison["status"] == "processing"
            mock_send_task.assert_called_once()

        comparison_id = comparison["id"]

        get_resp = await client.get(f"/api/v1/comparisons/{comparison_id}", headers=headers)
        assert get_resp.status_code == 200
        body = get_resp.json()
        assert body["comparison"]["id"] == comparison_id
        assert body["diff_items"] == []  # task was mocked, never actually ran
        assert body["counts"] == {}

        list_resp = await client.get("/api/v1/comparisons", headers=headers)
        assert list_resp.status_code == 200
        assert any(c["id"] == comparison_id for c in list_resp.json())


@pytest.mark.asyncio
async def test_get_nonexistent_comparison_returns_404():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.get(f"/api/v1/comparisons/{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 404
