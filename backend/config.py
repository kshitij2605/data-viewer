from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    db_path: str = "data/data_viewer.db"
    # Full SQLAlchemy URL. When set (e.g. PostgreSQL), it takes precedence over
    # db_path. Leave empty to use the SQLite file at db_path.
    database_url: str = ""
    secret_key: str = "__REDACTED_SECRET_KEY__"
    port: int = 8080
    embedding_endpoint: str = ""
    embedding_api_key: str = "__REDACTED_EMBEDDING_API_KEY__"
    embedding_model: str = "BAAI/bge-m3"
    thumbnail_dir: str = "data/thumbnails"

    # LLM (Qwen vLLM) — OpenAI-compatible endpoint
    llm_api_base: str = ""
    llm_api_key: str = "__REDACTED_EMBEDDING_API_KEY__"
    llm_model: str = "Qwen/Qwen3.5-122B-A10B"
    # Global throttling so 100 users can't overload one GPU.
    llm_max_concurrency: int = 24   # global cap on in-flight Qwen requests
    llm_max_retries: int = 3        # retries on transient (429/503/timeout) errors
    llm_timeout: float = 60.0       # per-attempt timeout (seconds)
    ai_suggestion_image_max_px: int = 1024  # longest edge of downscaled vision image

    # Elasticsearch
    es_url: str = ""
    es_user: str = "__REDACTED_ES_USER__"
    es_password: str = ""
    es_verify_certs: bool = False

    # Veda vector database (project-mdb) — REST API
    veda_url: str = ""
    veda_token: str = ""

    # MinIO
    minio_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "rag-anything"
    minio_secure: bool = False

    # LDAP (Active Directory)
    ldap_url: str = ""
    ldap_bind_dn: str = ""
    ldap_bind_credentials: str = ""
    ldap_user_search_base: str = ""
    ldap_search_filter: str = "(sAMAccountName={{username}})"
    ldap_starttls: bool = False
    ldap_tls_reject_unauthorized: bool = False
    ldap_login_uses_username: bool = True

    class Config:
        env_file = ".env"
        # Ignore env vars consumed elsewhere (e.g. WEB_CONCURRENCY by gunicorn)
        # rather than rejecting them as unexpected inputs.
        extra = "ignore"

settings = Settings()
