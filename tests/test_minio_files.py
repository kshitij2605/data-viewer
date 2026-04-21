"""Tests for MinIO-backed file serving endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
import tempfile
import json


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def create_minio_doc(db_session):
    """Create an ES-sourced document in the DB for file serving tests."""
    from backend.models import Document
    doc = Document(
        folder_name="minio_test_doc",
        folder_path="es://test_index/doc_minio",
        source_type="elasticsearch",
        es_index="test_index",
        es_parent_doc_id="doc_minio",
        minio_prefix="test_index/minio_test_doc",
        num_pages=2,
        num_images=1,
        num_tables=1,
        pdf_title="MinIO Test Document",
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


# ---------------------------------------------------------------------------
# Markdown endpoint
# ---------------------------------------------------------------------------

def test_get_markdown_from_minio(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    def mock_minio_text(path):
        assert "minio_test_doc" in path
        return "# Hello\n\nContent here.\n\n---\n\nPage 2 content."

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_text", mock_minio_text)

    resp = client.get(f"/api/documents/{doc.id}/markdown", headers=auth_headers)
    assert resp.status_code == 200
    assert "# Hello" in resp.text


def test_get_markdown_falls_back_to_local(client, auth_headers, db_session, monkeypatch):
    """Local docs should still work even when MinIO is mocked."""
    from backend.models import Document
    with tempfile.TemporaryDirectory() as tmpdir:
        doc_dir = Path(tmpdir) / "local_markdown_test"
        doc_dir.mkdir()
        mmd_file = doc_dir / "doc_with_captions.mmd"
        mmd_file.write_text("# Local Doc\n\nLocal content.", encoding="utf-8")

        doc = Document(folder_name="local_markdown_test", folder_path=str(doc_dir), source_type="local")
        db_session.add(doc)
        db_session.commit()
        db_session.refresh(doc)

        resp = client.get(f"/api/documents/{doc.id}/markdown", headers=auth_headers)
        assert resp.status_code == 200
        assert "# Local Doc" in resp.text


# ---------------------------------------------------------------------------
# Image endpoint
# ---------------------------------------------------------------------------

def test_get_image_tries_direct_and_prefixed(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    called_paths = []

    def mock_fetch_bytes(path):
        called_paths.append(path)
        if "test_doc_1_0.jpg" in path:
            return b"\x89PNG\r\n\x1a\n" + b"fake png"
        raise Exception("not found")

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_bytes", mock_fetch_bytes)

    resp = client.get(f"/api/documents/{doc.id}/images/test_doc_1_0.jpg", headers=auth_headers)
    assert resp.status_code == 200
    assert any("images/test_doc_1_0.jpg" in p for p in called_paths)


def test_get_image_404_when_not_in_minio(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    def mock_fetch_bytes(path):
        raise Exception("not found")

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_bytes", mock_fetch_bytes)

    resp = client.get(f"/api/documents/{doc.id}/images/nonexistent.jpg", headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Page thumbnail endpoint
# ---------------------------------------------------------------------------

def test_get_thumbnail_tries_named_page_pattern(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    called_paths = []

    def mock_fetch_bytes(path):
        called_paths.append(path)
        return b"\x89PNG\r\n\x1a\n" + b"fake png"

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_bytes", mock_fetch_bytes)

    resp = client.get(f"/api/documents/{doc.id}/page/1/thumbnail", headers=auth_headers)
    assert resp.status_code == 200
    assert any("minio_test_doc_1.png" in p for p in called_paths)


# ---------------------------------------------------------------------------
# Table image endpoint
# ---------------------------------------------------------------------------

def test_get_table_image_from_minio(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    called = []

    def mock_fetch_bytes(path):
        called.append(path)
        if "table_1_0.jpg" in path:
            return b"\x89PNG\r\n\x1a\n" + b"fake png"
        raise Exception("not found")

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_bytes", mock_fetch_bytes)

    resp = client.get(f"/api/documents/{doc.id}/tables/table_1_0.jpg", headers=auth_headers)
    assert resp.status_code == 200
    assert called


# ---------------------------------------------------------------------------
# Layout PDF endpoint
# ---------------------------------------------------------------------------

def test_get_layout_pdf_from_minio(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    def mock_fetch_bytes(path):
        assert "minio_test_doc_layouts.pdf" in path
        return b"%PDF-1.4 fake pdf"

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_bytes", mock_fetch_bytes)

    resp = client.get(f"/api/documents/{doc.id}/layout-pdf", headers=auth_headers)
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Page markdown endpoint (split by ---)
# ---------------------------------------------------------------------------

def test_get_page_markdown_from_minio(client, auth_headers, db_session, monkeypatch):
    doc = create_minio_doc(db_session)

    def mock_minio_text(path):
        return "# Page 1\n\nContent page 1.\n\n---\n\n# Page 2\n\nContent page 2."

    monkeypatch.setattr("backend.services.minio_client.fetch_minio_text", mock_minio_text)

    resp = client.get(f"/api/documents/{doc.id}/page/1/markdown", headers=auth_headers)
    assert resp.status_code == 200
    assert "Page 1" in resp.json()["content"]

    resp2 = client.get(f"/api/documents/{doc.id}/page/2/markdown", headers=auth_headers)
    assert resp2.status_code == 200
    assert "Page 2" in resp2.json()["content"]