from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Centralized application settings, loaded from environment variables / .env.
    Every service (DB, storage, AI pipeline) reads config from here — never
    reads os.environ directly. This keeps configuration testable and explicit.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    APP_NAME: str = "EngiSight AI"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- Database ---
    DATABASE_URL: str

    # --- Redis / Celery ---
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # --- MinIO ---
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ROOT_USER: str = "minio_admin"
    MINIO_ROOT_PASSWORD: str = "minio_password"
    MINIO_BUCKET_DRAWINGS: str = "drawings"
    MINIO_SECURE: bool = False

    # --- Qdrant ---
    QDRANT_HOST: str = "qdrant"
    QDRANT_PORT: int = 6333

    # --- LLM — Groq only, single provider (per build spec) ---
    # Text model: verified current Groq Production flagship (2026-08-09):
    #   * llama-3.3-70b-versatile is DEPRECATED — decommissioning 2026-08-16
    #   * Current Production flagship: openai/gpt-oss-120b (~500 tps, production-SLA)
    # Always re-check https://console.groq.com/docs/models before any release.
    LLM_PROVIDER: str = "groq"
    GROQ_API_KEY: str | None = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    # Vision model: Groq's only vision-capable model is preview-tier (qwen/qwen3.6-27b).
    # For classification tasks ALWAYS pass model_kwargs={"reasoning_effort": "none"}
    # to avoid <think> tokens wrapping the output and breaking JSON parsing.
    GROQ_VISION_MODEL: str = "qwen/qwen3.6-27b"
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — avoids re-parsing env on every import."""
    return Settings()


settings = get_settings()
