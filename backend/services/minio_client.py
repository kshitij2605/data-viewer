"""MinIO client singleton for fetching assets from rag_anything buckets."""

import io
from typing import List

from minio import Minio
from minio.error import S3Error

from backend.config import settings

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    """Get or create a cached MinIO client."""
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _minio_client


def fetch_minio_bytes(object_name: str, bucket: str | None = None) -> bytes:
    """Fetch an object's full content as bytes."""
    client = get_minio_client()
    bucket = bucket or settings.minio_bucket
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def fetch_minio_text(object_name: str, bucket: str | None = None) -> str:
    """Fetch an object's content as UTF-8 text."""
    return fetch_minio_bytes(object_name, bucket).decode("utf-8")


def list_minio_objects(prefix: str, bucket: str | None = None) -> List[str]:
    """List object names under a prefix."""
    client = get_minio_client()
    bucket = bucket or settings.minio_bucket
    objects = client.list_objects(bucket, prefix=prefix, recursive=True)
    return [obj.object_name for obj in objects]


def minio_object_exists(object_name: str, bucket: str | None = None) -> bool:
    """Check whether an object exists in MinIO."""
    client = get_minio_client()
    bucket = bucket or settings.minio_bucket
    try:
        client.stat_object(bucket, object_name)
        return True
    except S3Error:
        return False
