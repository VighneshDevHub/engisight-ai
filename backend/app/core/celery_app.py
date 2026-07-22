from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "engineering_doc_ai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Task modules are registered here as they're built (Step 4 onward)
celery_app.autodiscover_tasks(["app.workers"])


@celery_app.task(name="app.core.celery_app.ping")
def ping() -> str:
    """Trivial task to verify the worker is alive and consuming from the queue."""
    return "pong"
