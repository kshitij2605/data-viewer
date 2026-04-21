# Elasticsearch + MinIO Integration

## Background

This repository (`data-viewer-rag-anything`) is forked from the original `data-viewer` project. The original data-viewer loads pre-processed PDF document folders from the local filesystem. This fork integrates with the **rag_anything** pipeline system, allowing users to browse and import documents that have been processed and indexed by rag_anything — with chunks stored in Elasticsearch and assets (images, tables, thumbnails, markdown) stored in MinIO.

### Original data-viewer

- Loads document folders from local disk (requires `metadata.json` + `*_with_captions.mmd` + `images/` + `tables/`)
- Generates chunks locally using 5 strategies
- Serves images/tables/thumbnails from local filesystem
- All document data is self-contained in folder structure

### This fork (data-viewer-rag-anything)

- Connects directly to Elasticsearch to discover and import documents processed by rag_anything
- Serves images, tables, thumbnails, and markdown from MinIO (proxied through the backend)
- Imports ES chunks into local SQLite so all existing features work (feedback, editing, LLM evaluation)
- Retains backward compatibility with local folder loading

---

## Architecture Overview

```
rag_anything pipeline
  |
  +--> Elasticsearch (chunks with embeddings, metadata, MinIO paths)
  +--> MinIO (images, tables, page screenshots, markdown, parsing_metrics, layout PDFs)
  |
  v
data-viewer-rag-anything
  |
  +--> Backend reads from ES (document discovery, chunk import)
  +--> Backend proxies MinIO assets (images, tables, thumbnails, markdown)
  +--> SQLite stores imported chunks + user feedback/edits/scores
  +--> Frontend unchanged — same URLs, backend handles routing transparently
```

---

## Changes to rag_anything

Three new artifacts are now uploaded to MinIO during the processing pipeline (previously only images, tables, and page screenshots were persisted):

### New MinIO uploads

| Artifact | MinIO path | Content type |
|----------|-----------|-------------|
| Markdown file | `{index}/{pdf_name}/markdown/{pdf_name}_with_captions.mmd` | `text/markdown` |
| Parsing metrics | `{index}/{pdf_name}/metadata/parsing_metrics.json` | `application/json` |
| Layout PDF | `{index}/{pdf_name}/layout/{pdf_name}_layouts.pdf` | `application/pdf` |

### Files modified

- **`bulk_module/minio_handler.py`** — Added `upload_markdown()`, `upload_parsing_metrics()`, `upload_layout_pdf()` methods to `MinIOHandler`
- **`bulk_module/e2e_connector.py`** — Calls the 3 new upload methods in `PDFProcessor.process_batch()` after existing image/table/screenshot uploads
- **`bulk_module/index_local_pdfs.py`** — Same uploads added for the local PDF indexing path
- **`bulk_module/page_aware_chunker_deepseek.py`** — Added `markdown_path`, `parsing_metrics_path`, `layout_pdf_path` to `minio_metadata` in each chunk's ES document

### MinIO bucket structure (complete)

```
rag-anything/                          (bucket)
  {index_name}/
    {pdf_name}/
      images/                          (extracted figures)
        {pdf_name}_{page}_{idx}.jpg
      tables/                          (extracted table images)
        {pdf_name}_{page}_{idx}.jpg
      pages/                           (page screenshots at 150 DPI)
        {pdf_name}_{page_num}.png
      markdown/                        [NEW] (full markdown file)
        {pdf_name}_with_captions.mmd
      metadata/                        [NEW] (parsing metrics)
        parsing_metrics.json
      layout/                          [NEW] (annotated layout PDF)
        {pdf_name}_layouts.pdf
```

### Chunk metadata in Elasticsearch

Each chunk's `metadata.minio_metadata` now includes:

```json
{
  "bucket_name": "rag-anything",
  "page_thumbnail_path": "index/pdf_name/pages/pdf_name_3.png",
  "image_paths": ["index/pdf_name/images/pdf_name_3_0.jpg"],
  "table_paths": ["index/pdf_name/tables/pdf_name_3_0.jpg"],
  "markdown_path": "index/pdf_name/markdown/pdf_name_with_captions.mmd",
  "parsing_metrics_path": "index/pdf_name/metadata/parsing_metrics.json",
  "layout_pdf_path": "index/pdf_name/layout/pdf_name_layouts.pdf"
}
```

---

## Changes to data-viewer-rag-anything

### Backend: Configuration

**`backend/config.py`** — Added settings:

| Setting | Env var | Default | Description |
|---------|---------|---------|-------------|
| `es_url` | `ES_URL` | `""` | Elasticsearch URL |
| `es_user` | `ES_USER` | `"__REDACTED_ES_USER__"` | ES username |
| `es_password` | `ES_PASSWORD` | `""` | ES password |
| `es_verify_certs` | `ES_VERIFY_CERTS` | `false` | Verify SSL certs |
| `minio_endpoint` | `MINIO_ENDPOINT` | `""` | MinIO endpoint (host:port) |
| `minio_access_key` | `MINIO_ACCESS_KEY` | `""` | MinIO access key |
| `minio_secret_key` | `MINIO_SECRET_KEY` | `""` | MinIO secret key |
| `minio_bucket` | `MINIO_BUCKET` | `"rag-anything"` | MinIO bucket name |
| `minio_secure` | `MINIO_SECURE` | `false` | Use HTTPS for MinIO |

### Backend: New service modules

- **`backend/services/es_client.py`** — Cached Elasticsearch client singleton (`get_es_client()`)
- **`backend/services/minio_client.py`** — Cached MinIO client singleton with helper functions:
  - `get_minio_client()` — returns cached `Minio` instance
  - `fetch_minio_bytes(object_name)` — fetch object content as bytes
  - `fetch_minio_text(object_name)` — fetch object content as UTF-8 string
  - `list_minio_objects(prefix)` — list object names under a prefix
  - `minio_object_exists(object_name)` — check if object exists

### Backend: Database schema changes

**`backend/models.py`** — Added 4 columns to `Document`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `source_type` | Text | `"local"` | `"local"` or `"elasticsearch"` |
| `es_index` | Text | null | Elasticsearch index name |
| `es_parent_doc_id` | Text | null | `parent_doc_id` field in ES |
| `minio_prefix` | Text | null | MinIO path prefix, e.g. `"index_name/pdf_name"` |

**`backend/db.py`** — Auto-migration adds these columns on startup via `ALTER TABLE`.

### Backend: New API endpoints

**`backend/api/es_documents.py`** — Router prefix: `/api/es`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/es/indices` | List all ES indices (non-hidden) with doc counts |
| GET | `/api/es/documents?index={name}` | List unique documents in an index (aggregated by `parent_doc_id`) |
| POST | `/api/es/documents/{parent_doc_id}/import?index={name}` | Import a document's chunks from ES into SQLite |
| POST | `/api/es/documents/{document_id}/refresh` | Re-import chunks from ES (replaces existing, loses feedback) |

#### Import flow detail

1. Fetches all chunks for `parent_doc_id` from ES using `search_after` pagination
2. Extracts document metadata from the first chunk's `metadata` field
3. Derives `minio_prefix` from `minio_metadata` paths
4. Fetches `parsing_metrics.json` from MinIO for `num_images`, `num_tables`, `pdf_title`
5. Creates `Document` row with `source_type="elasticsearch"`
6. Creates `Chunk` rows from ES chunks
7. Creates `ChunkImage` rows from `minio_metadata.image_paths`
8. Triggers background AI review (fetches markdown from MinIO)

### Backend: Modified endpoints (MinIO branching)

All file-serving endpoints now check `doc.source_type`. If `"elasticsearch"`, they fetch from MinIO via `doc.minio_prefix`. Otherwise, they use the local filesystem (backward compatible).

**`backend/api/files.py`** — All 6 endpoints updated:

| Endpoint | Local source | MinIO source |
|----------|-------------|--------------|
| `GET /{id}/markdown` | `{folder}/*.mmd` | `{prefix}/markdown/*.mmd` |
| `GET /{id}/images/{name}` | `{folder}/images/{name}` | `{prefix}/images/{name}` (tries with pdf_name prefix too) |
| `GET /{id}/tables/{name}` | `{folder}/tables/{name}` | `{prefix}/tables/{name}` |
| `GET /{id}/layout-pdf` | `{folder}/*_layouts.pdf` | `{prefix}/layout/*_layouts.pdf` |
| `GET /{id}/page/{p}/thumbnail` | `thumbnails/{id}/page_{p}.jpg` | `{prefix}/pages/{pdf_name}_{p}.png` |
| `GET /{id}/page/{p}/markdown` | Split local mmd by page | Fetch mmd from MinIO, then split |

**`backend/api/views.py`** — Updated:
- `tables-only`: Lists table images from MinIO prefix for ES-sourced docs
- `images-only`: Fetches `parsing_metrics.json` from MinIO for image categories

**`backend/api/documents.py`** — Updated:
- `GET /documents/{id}`: Fetches `parsing_metrics.json` from MinIO for ES-sourced docs
- `DocumentOut` includes `source_type`, `es_index`, `es_parent_doc_id`
- `_launch_ai_review()`: Fetches markdown from MinIO for ES-sourced docs

**`backend/api/chunks.py`** — Updated:
- `POST /documents/{id}/chunk`: Fetches markdown from MinIO for re-chunking ES-sourced docs
- `evaluate-chunks` SSE: Downloads thumbnails from MinIO for AI suggestion evaluation

### Backend: Dependencies

Added to `backend/requirements.txt`:
- `elasticsearch>=8.0`
- `minio>=7.0`

### Frontend: New API functions

**`frontend/src/api/documents.ts`** — Added:

```typescript
// Types
interface ESIndex { index_name: string; doc_count: number }
interface ESDocument { parent_doc_id: string; filename: string; chunk_count: number; num_pages: number; index_name: string; already_imported: boolean }
interface ImportResult { id: number; folder_name: string; pdf_title: string | null; num_pages: number; num_images: number; num_tables: number; chunks_imported: number }

// Functions
listESIndices(): Promise<ESIndex[]>
listESDocuments(index: string): Promise<ESDocument[]>
importESDocument(parentDocId: string, index: string): Promise<ImportResult>
refreshFromES(documentId: number): Promise<void>
```

`Document` interface updated with `source_type`, `es_index`, `es_parent_doc_id`.

### Frontend: New component

**`frontend/src/components/ESImportDialog.tsx`** — Replaces the old `FolderLoadDialog`:

1. Dropdown to select an Elasticsearch index (auto-loaded on open)
2. Document list populated from the selected index (filename, chunk count, page count)
3. Checkboxes for multi-select (already-imported docs are greyed out with a badge)
4. "Select all" for unimported documents
5. Import button with progress bar
6. After import: refreshes document list and selects the imported document

### Frontend: Updated component

**`frontend/src/components/Sidebar.tsx`** — Swapped `FolderLoadDialog` import/usage for `ESImportDialog`. The "+" button in the sidebar now opens the ES import dialog.

### Frontend: No image URL changes

Since the backend proxies MinIO assets through the same endpoints (`/api/documents/{id}/images/{name}`, etc.), **no frontend image URL changes were needed**. This is transparent to all existing components.

---

## Data flow diagrams

### ES Import flow

```
User clicks "+" in sidebar
  → ESImportDialog opens
  → GET /api/es/indices (lists available ES indices)
  → User selects index
  → GET /api/es/documents?index=... (lists documents with chunk counts)
  → User selects documents and clicks "Import"
  → POST /api/es/documents/{parent_doc_id}/import?index=...
    → Backend fetches chunks from ES
    → Backend fetches parsing_metrics.json from MinIO
    → Creates Document + Chunk + ChunkImage rows in SQLite
    → Triggers background AI review
  → Frontend refreshes document list
  → User selects imported document → all views work
```

### Asset serving flow (ES-sourced documents)

```
Frontend requests /api/documents/{id}/images/{name}
  → Backend loads Document from SQLite
  → Checks doc.source_type == "elasticsearch"
  → Fetches from MinIO: {doc.minio_prefix}/images/{name}
  → Returns bytes as Response with correct content type
```

### Re-chunking flow (ES-sourced documents)

```
User selects a chunking strategy and clicks "Execute"
  → POST /api/documents/{id}/chunk
  → Backend checks doc.source_type
  → Fetches full markdown from MinIO: {prefix}/markdown/{pdf_name}_with_captions.mmd
  → Applies selected chunking strategy (character, recursive, semantic, markdown, page-wise)
  → Replaces old chunks in SQLite (CASCADE deletes edits/feedback)
  → Returns new chunks to frontend
```

---

## Backward compatibility

- Existing local-folder documents continue to work — all endpoints fall through to local filesystem when `source_type == "local"` (the default)
- The `FolderLoadDialog` component is still available in the codebase if needed
- The `POST /api/documents/load` and `POST /api/filesystem/browse` endpoints are preserved
- SQLite migration adds new columns with defaults, so existing databases are upgraded automatically
