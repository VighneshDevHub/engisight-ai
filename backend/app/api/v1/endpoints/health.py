import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.services import qdrant_service
from app.services.storage_service import storage_service

router = APIRouter()


@router.get("/health", tags=["health"])
async def health_check():
    """Basic liveness probe — no dependencies checked."""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}


@router.get("/health/ready", tags=["health"])
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """
    Readiness probe — confirms the API can actually reach its dependencies
    (Postgres, Redis, MinIO storage, Qdrant vector store). Used by Docker/K8s
    to know when the service is truly ready to receive traffic, and by us
    right now to verify Step 1 scaffolding is wired end-to-end.
    """
    checks = {
        "database": "unknown",
        "redis": "unknown",
        "storage": "unknown",
        "qdrant": "unknown",
    }

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        await redis_client.aclose()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    try:
        ok = storage_service.health_check()
        checks["storage"] = "ok" if ok else "error: bucket not reachable"
    except Exception as exc:
        checks["storage"] = f"error: {exc}"

    try:
        ok = qdrant_service.health_check()
        checks["qdrant"] = "ok" if ok else "error: qdrant not reachable"
    except Exception as exc:
        checks["qdrant"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks}
