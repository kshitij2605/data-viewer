from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    db_path: str = "data/data_viewer.db"
    secret_key: str = "__REDACTED_SECRET_KEY__"
    port: int = 8080
    embedding_endpoint: str = "http://embedding-host:8000"
    embedding_api_key: str = "__REDACTED_EMBEDDING_API_KEY__"
    embedding_model: str = "BAAI/bge-m3"
    thumbnail_dir: str = "data/thumbnails"

    # Elasticsearch
    es_url: str = ""
    es_user: str = "__REDACTED_ES_USER__"
    es_password: str = ""
    es_verify_certs: bool = False

    # MinIO
    minio_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "rag-anything"
    minio_secure: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
