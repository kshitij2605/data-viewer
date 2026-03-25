"""Tests for feedback API endpoints."""
import pytest

EXAMPLE_FOLDER = "/home/mac/25gitlab/deepseek-ocr-api/examples/output"


def _load_and_chunk(client, auth_headers):
    """Helper: load document and chunk it, return (doc_id, chunk_id)."""
    resp = client.post(
        "/api/documents/load",
        json={"folder_path": EXAMPLE_FOLDER},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    doc_id = resp.json()["id"]

    resp = client.post(
        f"/api/documents/{doc_id}/chunk",
        json={"strategy": "recursive"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    chunks = resp.json()
    assert len(chunks) > 0
    return doc_id, chunks[0]["id"]


class TestFeedback:
    def test_put_feedback_correct(self, client, auth_headers):
        _, chunk_id = _load_and_chunk(client, auth_headers)
        resp = client.put(
            f"/api/chunks/{chunk_id}/feedback",
            json={"emoji_type": "correct"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["emoji_type"] == "correct"
        assert data["chunk_id"] == chunk_id

    def test_get_feedback(self, client, auth_headers):
        _, chunk_id = _load_and_chunk(client, auth_headers)
        # Create feedback first
        client.put(
            f"/api/chunks/{chunk_id}/feedback",
            json={"emoji_type": "incorrect", "comment": "Needs fixing"},
            headers=auth_headers,
        )

        resp = client.get(
            f"/api/chunks/{chunk_id}/feedback",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["emoji_type"] == "incorrect"
        assert data["comment"] == "Needs fixing"

    def test_upsert_feedback(self, client, auth_headers):
        _, chunk_id = _load_and_chunk(client, auth_headers)
        # First feedback
        client.put(
            f"/api/chunks/{chunk_id}/feedback",
            json={"emoji_type": "correct"},
            headers=auth_headers,
        )
        # Update feedback
        resp = client.put(
            f"/api/chunks/{chunk_id}/feedback",
            json={"emoji_type": "needs_edit", "comment": "Updated"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["emoji_type"] == "needs_edit"
        assert data["comment"] == "Updated"

    def test_invalid_emoji_type(self, client, auth_headers):
        _, chunk_id = _load_and_chunk(client, auth_headers)
        resp = client.put(
            f"/api/chunks/{chunk_id}/feedback",
            json={"emoji_type": "invalid_type"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_get_feedback_none(self, client, auth_headers):
        _, chunk_id = _load_and_chunk(client, auth_headers)
        resp = client.get(
            f"/api/chunks/{chunk_id}/feedback",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["emoji_type"] is None

    def test_feedback_chunk_not_found(self, client, auth_headers):
        resp = client.put(
            "/api/chunks/99999/feedback",
            json={"emoji_type": "correct"},
            headers=auth_headers,
        )
        assert resp.status_code == 404
