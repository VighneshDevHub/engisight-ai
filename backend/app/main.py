from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.services.storage_service import storage_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Idempotent — safe on every restart. Runs sync (startup only, brief blocking is fine).
    storage_service.ensure_bucket()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered engineering document analysis platform — "
                 "drawing comparison, P&ID intelligence, and requirements/deviation analysis.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — restrict origins in production via env-driven allowlist
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["root"])
async def root():
    return {"message": f"{settings.APP_NAME} API is running", "docs": "/docs"}
