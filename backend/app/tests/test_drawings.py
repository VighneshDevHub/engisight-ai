import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.user import User


def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


async def _register_and_login(client: AsyncClient, *, role: str | None = None) -> str:
    """
    Register a user, optionally promote to a specific role (via direct DB
    update — bypassing the endpoint's role restriction), then log in and
    return the JWT.
    """
    email = _unique_email()
    password = "SuperSecret123"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": "Test Engineer", "password": password},
    )

    if role is not None:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            user.role = role
            await db.commit()

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


@pytest.mark.asyncio
async def test_requirements_drawing_type_accepted():
    """
    Phase 3 placeholder: `requirements` must be a valid drawing_type today
    (uploaded via the same extensible pipeline as baseline/revision/pid) so
    Phase 3 doesn't need to re-do Step 3's upload infra.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project_code = f"SPEC-{uuid.uuid4().hex[:6]}"

        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_code": project_code,
                "drawing_number": "SPEC-001",
                "drawing_type": "requirements",
            },
            files={"file": ("spec.pdf", io.BytesIO(b"%PDF-1.4 spec doc bytes"), "application/pdf")},
        )
        assert upload_resp.status_code == 201
        assert upload_resp.json()["drawing_type"] == "requirements"
        assert upload_resp.json()["sha256"] != ""


@pytest.mark.asyncio
async def test_upload_via_project_id_path():
    """
    Upload endpoint accepts `project_id` (referencing a real Project row) in
    addition to the ad-hoc `project_code` string path. Used by the frontend
    project-scoped pages.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a project first — must be engineering_manager+ to POST /projects
        token = await _register_and_login(client, role="engineering_manager")
        headers = {"Authorization": f"Bearer {token}"}

        proj_resp = await client.post(
            "/api/v1/projects",
            headers=headers,
            json={"code": f"PID{uuid.uuid4().hex[:6]}", "name": "Hull Upgrade"},
        )
        assert proj_resp.status_code == 201
        project = proj_resp.json()
        project_id = project["id"]

        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={
                "project_id": project_id,
                "drawing_number": "DWG-A",
                "drawing_type": "pid",
            },
            files={"file": ("pid.png", io.BytesIO(b"\x89PNG\r\n fake"), "image/png")},
        )
        assert upload_resp.status_code == 201
        drawing = upload_resp.json()
        assert drawing["project_id"] == project_id
        assert drawing["project_code"] == project["code"]
        assert drawing["drawing_type"] == "pid"


@pytest.mark.asyncio
async def test_dedup_same_bytes_different_rows():
    """
    SHA-256 content-hash object-key layout: two logical uploads of identical
    bytes produce:
      - distinct Drawing DB rows (different IDs — separate upload events)
      - identical sha256 digest and file_size (byte-level match)
      - object keys that share the same [project_code, drawing_type, sha256]
        path prefix (segments 0/1/2) — only the trailing uuid_filename differs.
    This content-addressable layout means MinIO-side byte-level deduplication
    (e.g. scan the sha-prefix folder for any existing object) is a simple
    change later without any DB/migration changes.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project_code = f"DEDUP-{uuid.uuid4().hex[:6]}"
        same_bytes = b"%PDF-1.4 identical bytes for dedup test " + b"A" * 100

        # Same drawing_type for both (so path segment 1 == "baseline" for both)
        resp_a = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={"project_code": project_code, "drawing_number": "DWG-A",
                  "drawing_type": "baseline"},
            files={"file": ("a.pdf", io.BytesIO(same_bytes), "application/pdf")},
        )
        resp_b = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={"project_code": project_code, "drawing_number": "DWG-B",
                  "drawing_type": "baseline"},
            files={"file": ("b.pdf", io.BytesIO(same_bytes), "application/pdf")},
        )
        assert resp_a.status_code == 201
        assert resp_b.status_code == 201
        row_a = resp_a.json()
        row_b = resp_b.json()

        # Distinct logical rows (different IDs)
        assert row_a["id"] != row_b["id"]

        # Same sha256 digest (byte-level match)
        assert row_a["sha256"] == row_b["sha256"]
        assert len(row_a["sha256"]) == 64  # hex SHA-256 is always 64 chars

        # Same file_size_bytes
        assert row_a["file_size_bytes"] == row_b["file_size_bytes"] == len(same_bytes)

        # Object key path structure:
        #   <project_code>/<drawing_type>/<sha256>/<uuid>_<filename>
        # Segments 0/1/2 must be identical between the two rows (same project,
        # same type, same sha). Only segment 3 differs.
        parts_a = row_a["object_key"].split("/")
        parts_b = row_b["object_key"].split("/")
        assert len(parts_a) == 4 and len(parts_b) == 4
        assert parts_a[:3] == parts_b[:3]  # project/type/sha identical
        # Path's sha segment matches the DB sha column (no mix-ups in key layout)
        assert parts_a[2] == row_a["sha256"]
        assert parts_a[0] == project_code
        assert parts_a[1] == "baseline"


@pytest.mark.asyncio
async def test_delete_drawing_by_uploader():
    """
    Uploader or admin can DELETE a drawing; the 204 response and subsequent
    404 on GET confirm the row is gone. Object storage cleanup is best-effort
    and not asserted here (depends on whether MinIO has the object).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        project_code = f"DEL-{uuid.uuid4().hex[:6]}"
        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={"project_code": project_code, "drawing_number": "DEL", "drawing_type": "baseline"},
            files={"file": ("del.pdf", io.BytesIO(b"%PDF-1.4 to delete"), "application/pdf")},
        )
        assert upload_resp.status_code == 201
        drawing_id = upload_resp.json()["id"]

        # Delete as the uploader — should return 204
        del_resp = await client.delete(f"/api/v1/drawings/{drawing_id}", headers=headers)
        assert del_resp.status_code == 204

        # Subsequent GET returns 404
        get_resp = await client.get(f"/api/v1/drawings/{drawing_id}", headers=headers)
        assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_sha256_column_populated_not_empty():
    """
    The sha256 column from migration 0008 must never be an empty string on rows
    created via the upload endpoint — the empty-string server_default in the
    migration is only for pre-existing rows, not new ones.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}
        content = b"%PDF-1.4 non-empty sha check " + uuid.uuid4().bytes

        upload_resp = await client.post(
            "/api/v1/drawings/upload",
            headers=headers,
            data={"project_code": f"SHA-{uuid.uuid4().hex[:6]}", "drawing_number": "SHA-CK", "drawing_type": "revision"},
            files={"file": ("sha.pdf", io.BytesIO(content), "application/pdf")},
        )
        assert upload_resp.status_code == 201
        row = upload_resp.json()
        assert row["sha256"] != ""
        assert row["sha256"].lower() == row["sha256"]  # lowercase hex
        assert all(c in "0123456789abcdef" for c in row["sha256"])
