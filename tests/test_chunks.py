"""Tests for chunk API endpoints."""
import pytest

EXAMPLE_FOLDER = "/home/mac/25gitlab/deepseek-ocr-api/examples/output"
SUBFOLDER = "【MM公式】Adobeといえば大塚商会_20251024-1-5"
FULL_SUBFOLDER = f"{EXAMPLE_FOLDER}/{SUBFOLDER}"


def _load_document(client, auth_headers):
    """Helper: load the example document and return its ID."""
    resp = client.post(
        "/api/documents/load",
        json={"folder_path": EXAMPLE_FOLDER},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()["id"]


def _chunk_document(client, auth_headers, doc_id, strategy="recursive"):
    """Helper: chunk a document with given strategy."""
    resp = client.post(
        f"/api/documents/{doc_id}/chunk",
        json={"strategy": strategy, "chunk_size": 2000, "chunk_overlap": 200},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()


class TestChunkDocument:
    def test_chunk_recursive(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id, "recursive")
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        # Each chunk has expected fields
        c = chunks[0]
        assert "id" in c
        assert "chunk_index" in c
        assert "page_number" in c
        assert "content" in c
        assert "is_modified" in c
        assert c["is_modified"] is False

    def test_chunk_page_strategy(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id, "page")
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        # Page strategy: each chunk corresponds to a page
        page_numbers = [c["page_number"] for c in chunks]
        assert 1 in page_numbers

    def test_chunk_document_not_found(self, client, auth_headers):
        resp = client.post(
            "/api/documents/99999/chunk",
            json={"strategy": "recursive"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_rechunking_deletes_old_chunks(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        # First chunking with recursive
        chunks1 = _chunk_document(client, auth_headers, doc_id, "recursive")
        count1 = len(chunks1)
        assert count1 > 0

        # Re-chunk with page strategy (should produce different count)
        chunks2 = _chunk_document(client, auth_headers, doc_id, "page")
        count2 = len(chunks2)
        assert count2 > 0

        # Listing should only show the new chunks
        resp = client.get(
            f"/api/documents/{doc_id}/chunks?per_page=100",
            headers=auth_headers,
        )
        data = resp.json()
        assert data["total"] == count2
        # All chunks should have the page strategy
        for c in data["chunks"]:
            # page strategy chunks are one-per-page; verify they exist
            assert "content" in c


class TestListChunks:
    def test_list_paginated(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        _chunk_document(client, auth_headers, doc_id)

        resp = client.get(
            f"/api/documents/{doc_id}/chunks",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "chunks" in data
        assert "total" in data
        assert "page" in data
        assert "per_page" in data
        assert data["page"] == 1
        assert data["per_page"] == 15
        assert len(data["chunks"]) <= 15

    def test_search_chunks(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        _chunk_document(client, auth_headers, doc_id)

        resp = client.get(
            f"/api/documents/{doc_id}/chunks?search=Adobe",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # All returned chunks should contain "Adobe"
        for c in data["chunks"]:
            assert "Adobe" in c["content"] or "adobe" in c["content"].lower()

    def test_list_chunks_doc_not_found(self, client, auth_headers):
        resp = client.get(
            "/api/documents/99999/chunks",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestGetChunk:
    def test_get_single_chunk(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        resp = client.get(
            f"/api/documents/{doc_id}/chunks/{chunk_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == chunk_id

    def test_get_chunk_not_found(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        resp = client.get(
            f"/api/documents/{doc_id}/chunks/99999",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestEditChunk:
    def test_create_edit(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        resp = client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Updated content"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["modified_content"] == "Updated content"
        assert data["original_content"] == chunks[0]["content"]

    def test_edit_updates_chunk_view(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Modified text"},
            headers=auth_headers,
        )

        # Get chunk should show modified content
        resp = client.get(
            f"/api/documents/{doc_id}/chunks/{chunk_id}",
            headers=auth_headers,
        )
        data = resp.json()
        assert data["content"] == "Modified text"
        assert data["is_modified"] is True

    def test_edit_upsert(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        # First edit
        client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Version 1"},
            headers=auth_headers,
        )
        # Second edit (upsert)
        resp = client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Version 2"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["modified_content"] == "Version 2"


class TestDiff:
    def test_get_diff(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]
        original = chunks[0]["content"]

        client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Changed content"},
            headers=auth_headers,
        )

        resp = client.get(
            f"/api/chunks/{chunk_id}/diff",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["original"] == original
        assert data["modified"] == "Changed content"

    def test_diff_no_edit(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        resp = client.get(
            f"/api/chunks/{chunk_id}/diff",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeleteEdit:
    def test_delete_edit_reverts(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]
        original = chunks[0]["content"]

        # Create edit
        client.put(
            f"/api/chunks/{chunk_id}/edit",
            json={"modified_content": "Edited"},
            headers=auth_headers,
        )

        # Delete edit
        resp = client.delete(
            f"/api/chunks/{chunk_id}/edit",
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Chunk should show original content
        resp = client.get(
            f"/api/documents/{doc_id}/chunks/{chunk_id}",
            headers=auth_headers,
        )
        data = resp.json()
        assert data["content"] == original
        assert data["is_modified"] is False

    def test_delete_edit_not_found(self, client, auth_headers):
        doc_id = _load_document(client, auth_headers)
        chunks = _chunk_document(client, auth_headers, doc_id)
        chunk_id = chunks[0]["id"]

        resp = client.delete(
            f"/api/chunks/{chunk_id}/edit",
            headers=auth_headers,
        )
        assert resp.status_code == 404
