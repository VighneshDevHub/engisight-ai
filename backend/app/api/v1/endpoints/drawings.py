import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.v1.deps import get_current_user
from app.core.celery_app import celery_app
from app.db.session import get_db
from app.models.drawing import Drawing
from app.models.extracted_parameter import ExtractedParameter
from app.models.user import User
from app.schemas.drawing import DrawingDownloadURL, DrawingRead
from app.schemas.extraction import ExtractedParameterRead, ExtractionTriggerResponse
from app.services.storage_service import storage_service

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/tiff"}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
# "baseline"/"revision" are Phase 1 (drawing comparison). "pid" is Phase 2
# (P&ID intelligence) — kept in the same table/endpoint since upload, storage,
# and ownership logic is identical; only the downstream processing differs.
ALLOWED_DRAWING_TYPES = {"baseline", "revision", "pid"}


@router.post("/upload", response_model=DrawingRead, status_code=status.HTTP_201_CREATED)
async def upload_drawing(
    project_code: str = Form(...),
    drawing_number: str = Form(...),
    drawing_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if drawing_type not in ALLOWED_DRAWING_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"drawing_type must be one of {sorted(ALLOWED_DRAWING_TYPES)}",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. "
            f"Allowed: {sorted(ALLOWED_CONTENT_TYPES)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds the 50MB limit",
        )

    object_key = f"{project_code}/{drawing_type}/{uuid.uuid4()}_{file.filename}"

    # boto3 is sync — run it off the event loop so one large upload
    # doesn't stall every other request being served by this worker.
    await run_in_threadpool(
        storage_service.upload_fileobj, io.BytesIO(contents), object_key, file.content_type
    )

    drawing = Drawing(
        project_code=project_code,
        drawing_number=drawing_number,
        drawing_type=drawing_type,
        original_filename=file.filename,
        object_key=object_key,
        content_type=file.content_type,
        file_size_bytes=len(contents),
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Drawing)
    if project_code:
        query = query.where(Drawing.project_code == project_code)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_drawing_or_404(drawing_id, db)
    result = await db.execute(
        select(ExtractedParameter).where(ExtractedParameter.drawing_id == drawing_id)
    )
    return result.scalars().all()
