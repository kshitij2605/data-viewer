"""Shared test fixtures: temp DB, test client, auth headers."""
import os
import tempfile
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.db import Base, _set_sqlite_pragmas, get_db
from backend.models import User
from passlib.hash import bcrypt


@pytest.fixture(scope="session")
def db_engine():
    """Create a temporary SQLite database for the entire test session."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", echo=False)
    event.listen(engine, "connect", _set_sqlite_pragmas)
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()
    os.unlink(path)


@pytest.fixture()
def db_session(db_engine):
    """Provide a transactional DB session that rolls back after each test."""
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    """FastAPI TestClient with DB dependency overridden."""
    from backend.main import app

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db

    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        # Seed test users
        if db_session.query(User).count() == 0:
            users = [
                User(username="admin", password_hash=bcrypt.hash("admin"), display_name="Admin User"),
                User(username="reviewer1", password_hash=bcrypt.hash("reviewer1"), display_name="Reviewer 1"),
            ]
            db_session.add_all(users)
            db_session.commit()
        yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    """Login as admin and return Authorization headers with JWT token."""
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}
