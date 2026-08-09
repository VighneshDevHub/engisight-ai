from fastapi import APIRouter

from app.api.v1.endpoints import auth, comparisons, drawings, health, projects, reviews

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(drawings.router, prefix="/drawings", tags=["drawings"])
api_router.include_router(comparisons.router, prefix="/comparisons", tags=["comparisons"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])

# Phase 1 complete after this. Phase 2 will add P&ID extraction + BoM endpoints.
