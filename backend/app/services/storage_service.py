import boto3
from botocore.client import Config

from app.core.config import settings


def _build_s3_client():
    scheme = "https" if settings.MINIO_SECURE else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


class StorageService:
    """
    Thin wrapper around the S3-compatible MinIO API. All I/O methods are
    synchronous (boto3 has no native async client) — callers must invoke
    them via starlette's `run_in_threadpool` from async endpoints so the
    event loop is never blocked by file transfer.
    """

    def __init__(self):
        self.client = _build_s3_client()
        self.bucket = settings.MINIO_BUCKET_DRAWINGS

    def ensure_bucket(self) -> None:
        """Idempotent — safe to call on every app startup."""
        existing = [b["Name"] for b in self.client.list_buckets().get("Buckets", [])]
        if self.bucket not in existing:
            self.client.create_bucket(Bucket=self.bucket)

    def upload_fileobj(self, file_obj, object_key: str, content_type: str) -> None:
        self.client.upload_fileobj(
            file_obj, self.bucket, object_key, ExtraArgs={"ContentType": content_type}
        )

    def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": object_key},
            ExpiresIn=expires_in,
        )

    def delete_object(self, object_key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=object_key)

    def object_exists(self, object_key: str) -> bool:
        """
        Lightweight existence check used by the upload endpoint for byte-level
        deduplication — avoids PUTting the same object twice under different
        keys. Returns False on any error (bucket unreachable, bad key) so the
        caller falls back to a fresh upload rather than silently skipping one.
        """
        try:
            self.client.head_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:
            return False

    def health_check(self) -> bool:
        """
        Lightweight liveness check for the object-store layer. Verifies we can
        actually talk to MinIO and the bucket exists (or can be listed) — does
        NOT mutate anything, so safe to call on every readiness probe.
        """
        try:
            existing = [b["Name"] for b in self.client.list_buckets().get("Buckets", [])]
            return self.bucket in existing
        except Exception:
            return False


storage_service = StorageService()
