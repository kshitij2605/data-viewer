"""Tests for Elasticsearch document import and refresh endpoints."""
import json
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_es_client():
    """Mock Elasticsearch client with test data."""
    es_mock = MagicMock()

    # Mock indices response
    es_mock.cat.indices.return_value = [
        {"index": "test_index", "docs.count": "150"},
        {"index": ".hidden", "docs.count": "0"},
    ]

    # Mock search response for document listing
    es_mock.search.return_value = {
        "aggregations": {
            "docs": {
                "buckets": [
                    {
                        "key": "doc_001",
                        "doc_count": 12,
                        "sample": {
                            "hits": {
                                "hits": [
                                    {
                                        "_source": {
                                            "metadata": {
                                                "filename": "test_document.pdf",
                                                "minio_metadata": {
                                                    "markdown_path": "test_index/test_document/markdown/test_document_with_captions.mmd",
                                                },
                                            },
                                            "page_number": 5,
                                        }
                                    }
                                ]
                            }
                        },
                        "max_page": {"value": 5},
                    }
                ]
            }
        }
    }

    return es_mock


@pytest.fixture
def mock_minio():
    """Mock MinIO client functions."""
    def fetch_bytes(path):
        if "parsing_metrics.json" in path:
            return json.dumps({
                "pdf_title": "Test Document",
                "num_images": {"total": 3},
                "num_tables": 2,
            }).encode()
        if "markdown" in path:
            return "# Test Document\n\nSome content here.\n\n---\n\nMore content on page 2.".encode()
        return b"fake data"

    def fetch_text(path):
        return fetch_bytes(path).decode("utf-8")

    return MagicMock(fetch_bytes=fetch_bytes, fetch_text=fetch_text)


# ---------------------------------------------------------------------------
# Tests: GET /api/es/indices
# ---------------------------------------------------------------------------

def test_list_indices_returns_sorted_list(client, auth_headers, mock_es_client):
    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.get("/api/es/indices", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        names = [d["index_name"] for d in data]
        assert "test_index" in names
        assert ".hidden" not in names
        assert names == sorted(names)


def test_list_indices_requires_auth(client):
    resp = client.get("/api/es/indices")
    assert resp.status_code == 401


def test_list_indices_handles_es_error(client, auth_headers):
    es_bad = MagicMock()
    es_bad.cat.indices.side_effect = Exception("ES unreachable")
    with patch("backend.api.es_documents.get_es_client", return_value=es_bad):
        resp = client.get("/api/es/indices", headers=auth_headers)
        assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Tests: GET /api/es/documents
# ---------------------------------------------------------------------------

def test_list_es_documents_returns_aggregated(client, auth_headers, mock_es_client):
    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.get("/api/es/documents", headers=auth_headers, params={"index": "test_index"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["parent_doc_id"] == "doc_001"
        assert data[0]["filename"] == "test_document.pdf"
        assert data[0]["chunk_count"] == 12
        assert data[0]["num_pages"] == 5
        assert data[0]["already_imported"] is False


def test_list_es_documents_marks_already_imported(client, auth_headers, db_session, mock_es_client):
    from backend.models import Document
    doc = Document(
        folder_name="test_doc",
        folder_path="es://test_index/doc_001",
        source_type="elasticsearch",
        es_index="test_index",
        es_parent_doc_id="doc_001",
        minio_prefix="test_index/test_doc",
        num_pages=5,
    )
    db_session.add(doc)
    db_session.commit()

    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.get("/api/es/documents", headers=auth_headers, params={"index": "test_index"})
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["already_imported"] is True


def test_list_es_documents_requires_index_param(client, auth_headers):
    resp = client.get("/api/es/documents", headers=auth_headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests: POST /api/es/documents/{parent_doc_id}/import
# ---------------------------------------------------------------------------

def test_import_creates_document_and_chunks(client, auth_headers, mock_es_client, mock_minio):
    # Extend mock to return chunk hits
    mock_es_client.search.return_value = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "parent_doc_id": "doc_001",
                        "chunk_id": 0,
                        "content": "Chunk 0 content",
                        "page_number": 1,
                        "metadata": {
                            "filename": "test_document.pdf",
                            "chunking_strategy": "recursive",
                            "minio_metadata": {
                                "image_paths": ["test_index/test_doc/images/test_doc_1_0.jpg"],
                            },
                            "parsing_metrics_path": "test_index/test_doc/metadata/parsing_metrics.json",
                        },
                    }
                },
                {
                    "_source": {
                        "parent_doc_id": "doc_001",
                        "chunk_id": 1,
                        "content": "Chunk 1 content",
                        "page_number": 2,
                        "metadata": {
                            "filename": "test_document.pdf",
                            "chunking_strategy": "recursive",
                            "minio_metadata": {
                                "image_paths": [],
                            },
                        },
                    }
                },
            ]
        }
    }

    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        with patch("backend.services.minio_client.fetch_minio_bytes", mock_minio.fetch_bytes):
            with patch("backend.services.minio_client.fetch_minio_text", mock_minio.fetch_text):
                resp = client.post(
                    "/api/es/documents/doc_001/import",
                    headers=auth_headers,
                    params={"index": "test_index"},
                )

    assert resp.status_code == 200
    result = resp.json()
    assert result["id"] is not None
    assert result["chunks_imported"] == 2


def test_import_returns_existing_if_already_imported(client, auth_headers, db_session, mock_es_client):
    from backend.models import Document
    doc = Document(
        folder_name="existing",
        folder_path="es://test_index/doc_001",
        source_type="elasticsearch",
        es_index="test_index",
        es_parent_doc_id="doc_001",
        minio_prefix="test_index/existing",
        num_pages=5,
    )
    db_session.add(doc)
    db_session.commit()

    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.post(
            "/api/es/documents/doc_001/import",
            headers=auth_headers,
            params={"index": "test_index"},
        )

    assert resp.status_code == 200
    result = resp.json()
    assert result["id"] == doc.id


def test_import_no_chunks_raises_404(client, auth_headers, mock_es_client):
    mock_es_client.search.return_value = {"hits": {"hits": []}}

    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.post(
            "/api/es/documents/doc_999/import",
            headers=auth_headers,
            params={"index": "test_index"},
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: POST /api/es/documents/{document_id}/refresh
# ---------------------------------------------------------------------------

def test_refresh_replaces_chunks(client, auth_headers, db_session, mock_es_client, mock_minio):
    from backend.models import Document, Chunk

    doc = Document(
        folder_name="refresh_test",
        folder_path="es://test_index/doc_refresh",
        source_type="elasticsearch",
        es_index="test_index",
        es_parent_doc_id="doc_refresh",
        minio_prefix="test_index/refresh_test",
        num_pages=3,
    )
    db_session.add(doc)
    db_session.flush()

    old_chunk = Chunk(document_id=doc.id, chunk_index=0, page_number=1, content="Old chunk", chunking_strategy="recursive")
    db_session.add(old_chunk)
    db_session.commit()

    mock_es_client.search.return_value = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "parent_doc_id": "doc_refresh",
                        "chunk_id": 0,
                        "content": "New chunk 0",
                        "page_number": 1,
                        "metadata": {
                            "chunking_strategy": "recursive",
                            "minio_metadata": {"image_paths": []},
                        },
                    }
                },
            ]
        }
    }

    with patch("backend.api.es_documents.get_es_client", return_value=mock_es_client):
        resp = client.post(
            f"/api/es/documents/{doc.id}/refresh",
            headers=auth_headers,
        )

    assert resp.status_code == 200
    assert resp.json()["chunks_imported"] == 1

    db_session.expire_all()
    remaining = db_session.query(Chunk).filter(Chunk.document_id == doc.id).all()
    assert len(remaining) == 1
    assert remaining[0].content == "New chunk 0"


def test_refresh_non_es_document_404(client, auth_headers, db_session):
    from backend.models import Document
    doc = Document(folder_name="local_doc", folder_path="/tmp/fake", source_type="local")
    db_session.add(doc)
    db_session.commit()

    resp = client.post(f"/api/es/documents/{doc.id}/refresh", headers=auth_headers)
    assert resp.status_code == 404