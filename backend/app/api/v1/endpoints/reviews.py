import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.review import Review
from app.models.user import User
from app.schemas.review import (
    LatestReviewBatchRequest,
    LatestReviewBatchResponse,
    ReviewCreate,
    ReviewRead,
)

router = APIRouter()

_ALLOWED_ENTITY_TYPES = {"extracted_parameter", "bom_item", "diff_item"}


@router.post("", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"entity_type must be one of {sorted(_ALLOWED_ENTITY_TYPES)}",
        )

    if current_user.role not in {"admin", "engineering_manager", "reviewer", "engineer"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    review = Review(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        extraction_run_id=payload.extraction_run_id,
        decision=payload.decision,
        comment=payload.comment,
        reviewer_id=current_user.id,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.get("", response_model=list[ReviewRead])
async def list_reviews(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    extraction_run_id: uuid.UUID | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Review)
    if entity_type is not None:
        query = query.where(Review.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(Review.entity_id == entity_id)
    if extraction_run_id is not None:
        query = query.where(Review.extraction_run_id == extraction_run_id)
    query = query.order_by(Review.created_at.desc()).limit(min(limit, 500))
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/latest",
    response_model=LatestReviewBatchResponse,
    dependencies=[Depends(require_role("admin", "engineering_manager", "reviewer", "engineer", "viewer"))],
)
async def get_latest_reviews_batch(
    payload: LatestReviewBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"entity_type must be one of {sorted(_ALLOWED_ENTITY_TYPES)}",
        )

    reviews_by_id: dict[uuid.UUID, ReviewRead | None] = {eid: None for eid in payload.entity_ids}
    if not payload.entity_ids:
        return LatestReviewBatchResponse(entity_type=payload.entity_type, reviews_by_entity_id=reviews_by_id)

    conds = [Review.entity_type == payload.entity_type, Review.entity_id.in_(payload.entity_ids)]
    if payload.extraction_run_id is not None:
        conds.append(Review.extraction_run_id == payload.extraction_run_id)

    result = await db.execute(
        select(Review)
        .where(and_(*conds))
        .order_by(Review.entity_id.asc(), Review.created_at.desc())
    )
    rows = result.scalars().all()

    seen: set[uuid.UUID] = set()
    for r in rows:
        if r.entity_id in seen:
            continue
        reviews_by_id[r.entity_id] = ReviewRead.model_validate(r)
        seen.add(r.entity_id)

    return LatestReviewBatchResponse(entity_type=payload.entity_type, reviews_by_entity_id=reviews_by_id)

