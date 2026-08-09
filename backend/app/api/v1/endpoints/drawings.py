import hashlib
import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.v1.deps import get_current_user
from app.core.celery_app import celery_app
from app.db.session import get_db
from app.models.bom_item import BomItem
from app.models.drawing import Drawing
from app.models.extracted_parameter import ExtractedParameter
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.bom import BomItemRead, BomSummary, PidExtractionTriggerResponse
from app.schemas.drawing import DrawingDownloadURL, DrawingRead, DrawingType
from app.schemas.extraction import ExtractedParameterRead, ExtractionRunRead, ExtractionTriggerResponse
from app.services.storage_service import storage_service

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/tiff"}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
# "baseline"/"revision" are Phase 1 (drawing comparison). "pid" is Phase 2
# (P&ID intelligence). "requirements" is Phase 3 (requirements deviation
# analysis). All four share the same upload/storage/ownership logic — only
# the downstream Celery worker pipeline differs per type. Extensible by
# design: new values can be added to the set + a new worker pipeline without
# any DB schema/migration changes.
ALLOWED_DRAWING_TYPES: set[DrawingType] = {"baseline", "revision", "pid", "requirements"}


def _sha256_bytes(contents: bytes) -> str:
    """
    Compute a lowercase hex SHA-256 digest of `contents`. Used for:
      1. Deduplicating uploads in the upload endpoint (an exact re-upload of
         the same bytes to the same project_code/type reuses the existing
         object rather than storing a duplicate).
      2. The Drawing.sha256 DB column — downstream workers can verify the
         bytes they pull from storage are the same bytes the user uploaded.
    """
    return hashlib.sha256(contents).hexdigest()


def _build_object_key(
    project_code: str, drawing_type: str, sha256_hex: str, original_filename: str
) -> str:
    """
    Stable content-hash-prefixed object key.

    Layout:  <project_code>/<drawing_type>/<sha256>/<uuid>_<filename>

    The sha256 prefix is the dedup layer — we can cheaply scan MinIO for an
    existing folder at the sha256 prefix and reuse the *same object* for
    duplicate uploads (the Drawing DB row still records a separate logical
    upload per user/project, but the bytes are stored once on disk, not N
    times). The trailing uuid+filename provides URL uniqueness and retains
    the user's human-readable filename for the presigned download URL.

    This key is also S3-compatible (single / separators, no special chars) —
    swapping MinIO for AWS S3 later is a storage-service config change only.
    """
    safe_filename = (original_filename or "upload").replace("\\", "/").split("/")[-1]
    return f"{project_code}/{drawing_type}/{sha256_hex}/{uuid.uuid4().hex}_{safe_filename}"


@router.post("/upload", response_model=DrawingRead, status_code=status.HTTP_201_CREATED)
async def upload_drawing(
    project_code: str | None = Form(None),
    project_id: uuid.UUID | None = Form(None),
    drawing_number: str = Form(...),
    drawing_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resolved_project_code: str | None = None
    resolved_project_id: uuid.UUID | None = None
    if project_id is not None:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if current_user.role != "admin":
            membership = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == current_user.id,
                )
            )
            if membership.scalar_one_or_none() is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
        resolved_project_code = project.code
        resolved_project_id = project.id
    elif project_code:
        resolved_project_code = project_code.strip()
        resolved_project_id = None
        if not resolved_project_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_code cannot be blank",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either project_id or project_code",
        )

    if drawing_type not in ALLOWED_DRAWING_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"drawing_type must be one of {sorted(ALLOWED_DRAWING_TYPES)}."
                " See schema at app/schemas/drawing.py -> DrawingType."
            ),
        )

    if file.content_type is None or file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type: {file.content_type!r}. "
                f"Allowed: {sorted(ALLOWED_CONTENT_TYPES)}"
            ),
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds the 50MB limit ({len(contents):,} bytes received).",
        )
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file received — refusing to create a Drawing.",
        )

    if not drawing_number or not drawing_number.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="drawing_number cannot be blank.",
        )

    sha256_hex = _sha256_bytes(contents)
    original_filename = file.filename or "upload"
    object_key = _build_object_key(
        resolved_project_code, drawing_type, sha256_hex, original_filename
    )

    # Deduplication pass — if an identical byte object for this project already
    # exists in MinIO, we *still* create a new logical Drawing row in the DB
    # (different upload event, potentially different drawing_number/type) but
    # we skip re-uploading the same bytes. The presigned download URL will
    # point to the canonical object under the SHA-256 prefix, same as always.
    if not storage_service.object_exists(object_key):
        # boto3 is sync — run off the event loop so a large upload doesn't
        # stall every other request being served by this worker.
        await run_in_threadpool(
            storage_service.upload_fileobj, io.BytesIO(contents), object_key, file.content_type
        )

    drawing = Drawing(
        project_code=resolved_project_code,
        project_id=resolved_project_id,
        drawing_number=drawing_number.strip(),
        drawing_type=drawing_type,
        original_filename=original_filename,
        object_key=object_key,
        content_type=file.content_type,
        file_size_bytes=len(contents),
        sha256=sha256_hex,
        status="uploaded",
        uploaded_by=current_user.id,
    )
    db.add(drawing)
    await db.commit()
    await db.refresh(drawing)
    return drawing


@router.get("", response_model=list[DrawingRead])
async def list_drawings(
    project_code: str | None = None,
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Drawing)
    if current_user.role != "admin":
        member_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
        query = query.where(
            (Drawing.project_id.in_(member_subq)) | (Drawing.uploaded_by == current_user.id)
        )
    if project_code:
        query = query.where(Drawing.project_code == project_code)
    if project_id:
        query = query.where(Drawing.project_id == project_id)
    result = await db.execute(query.order_by(Drawing.created_at.desc()))
    return result.scalars().all()


@router.get("/{drawing_id}", response_model=DrawingRead)
async def get_drawing(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = await _get_drawing_or_404(drawing_id, db)
    return drawing


@router.get("/{drawing_id}/download-url", response_model=DrawingDownloadURL)
async def get_download_url(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    drawing = await _get_drawing_or_404(drawing_id, db)
    expires_in = 3600
    url = await run_in_threadpool(
        storage_service.generate_presigned_url, drawing.object_key, expires_in
    )
    return DrawingDownloadURL(url=url, expires_in_seconds=expires_in)


async def _get_drawing_or_404(drawing_id: uuid.UUID, db: AsyncSession) -> Drawing:
    result = await db.execute(select(Drawing).where(Drawing.id == drawing_id))
    drawing = result.scalar_one_or_none()
    if drawing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drawing not found")
    return drawing


@router.post(
    "/{drawing_id}/extract",
    response_model=ExtractionTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_extraction(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Enqueues the AI extraction pipeline as a background Celery job and returns
    immediately — extraction (OCR + detection + LLM) takes seconds-to-minutes,
    far too long for a synchronous request.

    Note: we call celery via `send_task` (by name string) rather than importing
    the task function directly. This keeps heavy AI dependencies (PaddleOCR,
    ultralytics, langchain) out of the FastAPI web process entirely — only the
    Celery worker container needs them installed and loaded.
    """
    drawing = await _get_drawing_or_404(drawing_id, db)

    drawing.status = "processing"
    await db.commit()

    task = celery_app.send_task(
        "app.workers.tasks.extract_drawing_parameters", args=[str(drawing.id)]
    )
    return ExtractionTriggerResponse(task_id=task.id, drawing_id=drawing.id, status="processing")


@router.get("/{drawing_id}/parameters", response_model=list[ExtractedParameterRead])
async def list_extracted_parameters(
    drawing_id: uuid.UUID,
    extraction_run_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns parameters from one extraction run. If extraction_run_id is omitted,
    returns parameters from the LATEST run (same logic as comparison worker uses).

    This means re-running extraction multiple times appends, not overwrites —
    the UI always shows the newest, but older runs remain for audit/comparison.
    """
    await _get_drawing_or_404(drawing_id, db)

    from sqlalchemy import func

    if extraction_run_id is None:
        subq = (
            select(
                ExtractedParameter.extraction_run_id.label("run_id"),
                func.max(ExtractedParameter.created_at).label("latest_create"),
            )
            .where(ExtractedParameter.drawing_id == drawing_id)
            .group_by(ExtractedParameter.extraction_run_id)
            .order_by(func.max(ExtractedParameter.created_at).desc())
            .limit(1)
        )
        row = (await db.execute(subq)).first()
        target_run = row[0] if row else None
    else:
        target_run = extraction_run_id

    query = select(ExtractedParameter).where(ExtractedParameter.drawing_id == drawing_id)
    if target_run is not None:
        query = query.where(ExtractedParameter.extraction_run_id == target_run)
    else:
        query = query.where(ExtractedParameter.extraction_run_id.is_(None))

    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/{drawing_id}/extract-bom",
    response_model=PidExtractionTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_pid_extraction(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Enqueues Phase 2's P&ID component recognition pipeline (OpenCV region
    proposal + Groq vision-LLM recognition). Only valid for drawings uploaded
    with drawing_type='pid' — using this on a baseline/revision drawing would
    run vision recognition against a drawing that was never meant to have
    P&ID-style component symbols on it.
    """
    drawing = await _get_drawing_or_404(drawing_id, db)

    if drawing.drawing_type != "pid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for drawings with drawing_type='pid'. "
            "Use POST /drawings/{id}/extract for baseline/revision drawings.",
        )

    drawing.status = "processing"
    await db.commit()

    task = celery_app.send_task(
        "app.workers.tasks.extract_pid_components", args=[str(drawing.id)]
    )
    return PidExtractionTriggerResponse(task_id=task.id, drawing_id=drawing.id, status="processing")


@router.get("/{drawing_id}/bom", response_model=BomSummary)
async def get_bom(
    drawing_id: uuid.UUID,
    extraction_run_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns BoM from the latest (or explicitly specified) extraction run for
    a P&ID drawing. Same run-scoping behavior as list_extracted_parameters.
    """
    await _get_drawing_or_404(drawing_id, db)

    from sqlalchemy import func

    if extraction_run_id is None:
        subq = (
            select(
                BomItem.extraction_run_id.label("run_id"),
                func.max(BomItem.created_at).label("latest_create"),
            )
            .where(BomItem.drawing_id == drawing_id)
            .group_by(BomItem.extraction_run_id)
            .order_by(func.max(BomItem.created_at).desc())
            .limit(1)
        )
        row = (await db.execute(subq)).first()
        target_run = row[0] if row else None
    else:
        target_run = extraction_run_id

    query = select(BomItem).where(BomItem.drawing_id == drawing_id)
    if target_run is not None:
        query = query.where(BomItem.extraction_run_id == target_run)
    else:
        query = query.where(BomItem.extraction_run_id.is_(None))

    result = await db.execute(query)
    items = result.scalars().all()

    quantity_by_type: dict[str, int] = {}
    for item in items:
        quantity_by_type[item.component_type] = (
            quantity_by_type.get(item.component_type, 0) + item.quantity
        )

    return BomSummary(
        items=items,
        quantity_by_type=quantity_by_type,
        total_components=sum(quantity_by_type.values()),
    )


@router.get("/{drawing_id}/runs", response_model=list[ExtractionRunRead])
async def list_drawing_extraction_runs(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all distinct extraction runs recorded for a drawing, grouped by extraction_run_id,
    with run type (parameter or bom), item count, and latest creation timestamp.
    """
    await _get_drawing_or_404(drawing_id, db)
    from sqlalchemy import func

    param_query = (
        select(
            ExtractedParameter.extraction_run_id.label("run_id"),
            func.count(ExtractedParameter.id).label("cnt"),
            func.max(ExtractedParameter.created_at).label("latest_at"),
        )
        .where(ExtractedParameter.drawing_id == drawing_id)
        .where(ExtractedParameter.extraction_run_id.is_not(None))
        .group_by(ExtractedParameter.extraction_run_id)
    )
    param_res = await db.execute(param_query)

    bom_query = (
        select(
            BomItem.extraction_run_id.label("run_id"),
            func.count(BomItem.id).label("cnt"),
            func.max(BomItem.created_at).label("latest_at"),
        )
        .where(BomItem.drawing_id == drawing_id)
        .where(BomItem.extraction_run_id.is_not(None))
        .group_by(BomItem.extraction_run_id)
    )
    bom_res = await db.execute(bom_query)

    runs: list[ExtractionRunRead] = []
    for r_id, cnt, max_at in param_res.all():
        if r_id is not None:
            runs.append(
                ExtractionRunRead(
                    extraction_run_id=r_id,
                    drawing_id=drawing_id,
                    run_type="parameter",
                    item_count=cnt,
                    created_at=max_at,
                )
            )
    for r_id, cnt, max_at in bom_res.all():
        if r_id is not None:
            runs.append(
                ExtractionRunRead(
                    extraction_run_id=r_id,
                    drawing_id=drawing_id,
                    run_type="bom",
                    item_count=cnt,
                    created_at=max_at,
                )
            )

    runs.sort(key=lambda x: x.created_at, reverse=True)
    return runs


@router.delete("/{drawing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drawing(
    drawing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes a drawing:
      1. Checks ownership (admin or the original uploader).
      2. Removes the object from MinIO storage (best-effort — missing object is OK).
      3. Deletes the DB row (CASCADE takes care of extracted_parameters, diff_items,
         bom_items, connectivity_edges, reviews via FK constraints per Alembic).
    """
    drawing = await _get_drawing_or_404(drawing_id, db)

    if current_user.role != "admin" and drawing.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the uploader can delete a drawing.",
        )

    # Best-effort object storage cleanup — a delete on an already-missing key
    # (e.g. storage was reinitialized) shouldn't prevent the DB row from going away.
    try:
        await run_in_threadpool(storage_service.delete_object, drawing.object_key)
    except Exception:
        pass

    await db.delete(drawing)
    await db.commit()
    return None

