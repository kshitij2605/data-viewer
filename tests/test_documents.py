"""Tests for document loading and file serving endpoints."""
import pytest

EXAMPLE_FOLDER = "/home/mac/25gitlab/deepseek-ocr-api/examples/output"
SUBFOLDER = "【MM公式】Adobeといえば大塚商会_20251024-1-5"
FULL_SUBFOLDER = f"{EXAMPLE_FOLDER}/{SUBFOLDER}"


class TestLoadDocument:
    def test_load_valid_folder(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["folder_name"] == SUBFOLDER
        assert data["pdf_title"] is not None
        assert data["num_pages"] == 5
        assert data["num_images"] == 31
        assert data["num_tables"] == 0
        assert "id" in data

    def test_load_invalid_path(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": "/nonexistent/path"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "does not exist" in resp.json()["detail"]

    def test_load_duplicate_returns_existing(self, client, auth_headers):
        # Load once
        resp1 = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        assert resp1.status_code == 200
        id1 = resp1.json()["id"]

        # Load again — should return same document
        resp2 = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        assert resp2.status_code == 200
        assert resp2.json()["id"] == id1

    def test_load_requires_auth(self, client):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
        )
        assert resp.status_code in (401, 403)


class TestListDocuments:
    def test_list_empty(self, client, auth_headers):
        resp = client.get("/api/documents", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_after_load(self, client, auth_headers):
        client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        resp = client.get("/api/documents", headers=auth_headers)
        assert resp.status_code == 200
        docs = resp.json()
        assert len(docs) >= 1


class TestDocumentDetail:
    def _load(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        return resp.json()["id"]

    def test_detail_with_metadata(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(f"/api/documents/{doc_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "metadata" in data
        assert "parsing_metrics" in data
        assert data["metadata"]["num_pages"] == 5

    def test_detail_not_found(self, client, auth_headers):
        resp = client.get("/api/documents/99999", headers=auth_headers)
        assert resp.status_code == 404


class TestMarkdownEndpoint:
    def _load(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        return resp.json()["id"]

    def test_get_markdown(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(f"/api/documents/{doc_id}/markdown", headers=auth_headers)
        assert resp.status_code == 200
        assert "Adobe" in resp.text


class TestImageEndpoint:
    def _load(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        return resp.json()["id"]

    def test_get_image(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(
            f"/api/documents/{doc_id}/images/1_0.jpg",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"

    def test_get_image_not_found(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(
            f"/api/documents/{doc_id}/images/nonexistent.jpg",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestViewEndpoints:
    def _load(self, client, auth_headers):
        resp = client.post(
            "/api/documents/load",
            json={"folder_path": EXAMPLE_FOLDER},
            headers=auth_headers,
        )
        return resp.json()["id"]

    def test_text_only(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(f"/api/documents/{doc_id}/text-only", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "paragraphs" in data
        assert len(data["paragraphs"]) > 0

    def test_tables_only(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(f"/api/documents/{doc_id}/tables-only", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "tables" in data

    def test_images_only(self, client, auth_headers):
        doc_id = self._load(client, auth_headers)
        resp = client.get(f"/api/documents/{doc_id}/images-only", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "images" in data
        assert len(data["images"]) > 0
        assert "image_path" in data["images"][0]
        assert "caption" in data["images"][0]
