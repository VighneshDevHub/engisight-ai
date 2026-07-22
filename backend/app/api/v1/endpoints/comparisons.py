import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.celery_app import celery_app
from app.db.session import get_db
from app.models.comparison import Comparison
from app.models.diff_item import DiffItem
from app.models.drawing import Drawing
from app.models.user import User
from app.schemas.comparison import ComparisonCreate, ComparisonRead, ComparisonSummary

router = APIRouter()


@router.post("", response_model=ComparisonRead, status_code=status.HTTP_202_ACCEPTED)
async def create_comparison(
    payload: ComparisonCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    baseline = await _get_drawing_or_404(payload.baseline_drawing_id, db)
    revision = await _get_drawing_or_404(payload.revision_drawing_id, db)

    if baseline.drawing_type != "baseline":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="baseline_drawing_id must reference a drawing with drawing_type='baseline'",
        )
    if revision.drawing_type != "revision":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="revision_drawing_id must reference a drawing with drawing_type='revision'",
        )
    for d in (baseline, revision):
        if d.status != "processed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Drawing '{d.original_filename}' has status '{d.status}', "
                "not 'processed'. Run extraction on both drawings before comparing.",
            )

    comparison = Comparison(
        baseline_drawing_id=baseline.id,
        revision_drawing_id=revision.id,
        status="processing",
        requested_by=current_user.id,
    )
    db.add(comparison)
    await db.commit()
    await db.refresh(comparison)

    celery_app.send_task("app.workers.tasks.run_comparison", args=[str(comparison.id)])

    return comparison


@router.get("/{comparison_id}", response_model=ComparisonSummary)
async def get_comparison(
    comparison_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comparison).where(Comparison.id == comparison_id))
    comparison = result.scalar_one_or_none()
    if comparison is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comparison not found")

    items_result = await db.execute(
        select(DiffItem).where(DiffItem.comparison_id == comparison_id)
    )
    diff_items = items_result.scalars().all()

    counts: dict[str, int] = {}
    for item in diff_items:
        counts[item.classification] = counts.get(item.classification, 0) + 1

    return ComparisonSummary(comparison=comparison, counts=counts, diff_items=diff_items)


@router.get("", response_model=list[ComparisonRead])
async def list_comparisons(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comparison).order_by(Comparison.created_at.desc()))
    return result.scalars().all()


async def _get_drawing_or_404(drawing_id: uuid.UUID, db: AsyncSession) -> Drawing:
    result = await db.execute(select(Drawing).where(Drawing.id == drawing_id))
    drawing = result.scalar_one_or_none()
    if drawing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Drawing {drawing_id} not found"
        )
    return drawing
