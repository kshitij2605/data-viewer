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

    class Config:
        env_file = ".env"

settings = Settings()
