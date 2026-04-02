from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.config import settings
from pathlib import Path

class Base(DeclarativeBase):
    pass

def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

def get_engine(db_path: str = None):
    path = db_path or settings.db_path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", echo=False)
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

def init_db():
    Base.metadata.create_all(bind=engine)
    # Migrate: add score columns if missing
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(__import__('sqlalchemy').text("PRAGMA table_info(chunks)"))]
        if "rag_score" not in cols:
            conn.execute(__import__('sqlalchemy').text("ALTER TABLE chunks ADD COLUMN rag_score REAL"))
        if "faq_score" not in cols:
            conn.execute(__import__('sqlalchemy').text("ALTER TABLE chunks ADD COLUMN faq_score REAL"))
        if "ai_suggestion" not in cols:
            conn.execute(__import__('sqlalchemy').text("ALTER TABLE chunks ADD COLUMN ai_suggestion TEXT"))
        conn.commit()
