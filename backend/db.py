from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.config import settings
from pathlib import Path


class Base(DeclarativeBase):
    pass


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def get_engine(db_url: str = None):
    """Build the engine. Prefers settings.database_url (e.g. PostgreSQL);
    falls back to a local SQLite file at settings.db_path."""
    url = db_url or settings.database_url
    if url:
        # PostgreSQL (or any non-SQLite backend). pool_pre_ping recovers from
        # dropped connections; modest pool sized for several gunicorn workers.
        engine = create_engine(
            url,
            echo=False,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_recycle=1800,
        )
        return engine

    # SQLite fallback (single-process / dev).
    path = settings.db_path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine


engine = get_engine()
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the initial schema shipped. Kept dialect-portable
# (REAL/TEXT and DEFAULT '...' are valid in both SQLite and PostgreSQL) so the
# same migration runs everywhere. On a fresh database create_all() already adds
# every column, so these become no-ops.
_COLUMN_MIGRATIONS = {
    "chunks": [
        ("rag_score", "REAL"),
        ("faq_score", "REAL"),
        ("ai_suggestion", "TEXT"),
    ],
    "documents": [
        ("ai_review", "TEXT"),
        ("ai_review_status", "TEXT DEFAULT 'pending'"),
        ("source_type", "TEXT DEFAULT 'local'"),
        ("es_index", "TEXT"),
        ("es_parent_doc_id", "TEXT"),
        ("minio_prefix", "TEXT"),
        ("layout_pdf_path", "TEXT"),
        ("chunking_strategy", "TEXT"),
        ("veda_collection", "TEXT"),
        ("veda_doc_id", "TEXT"),
        ("source_markdown", "TEXT"),
    ],
}


def init_db():
    # Import models so every table is registered on Base before create_all.
    import backend.models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Add any columns missing from pre-existing tables (idempotent).
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _COLUMN_MIGRATIONS.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, coltype in columns:
                if name not in present:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {coltype}'))
