# System Architecture

## Overview

Data Viewer is a full-stack application for reviewing PDF documents that have been processed through an OCR/extraction pipeline. It enables users to view extracted content (markdown, tables, images), chunk the text using multiple strategies, evaluate chunk quality via LLM-as-a-Judge, and provide human feedback.

**Stack**: FastAPI (Python) + React (TypeScript) + SQLite + Qwen LLM + Elasticsearch + MinIO

Deployed as a Docker container (multi-stage build) with Uvicorn as the ASGI server.

---

## High-Level Architecture

```
Browser (React SPA)
  |
  |  HTTP / SSE
  v
FastAPI Server (Uvicorn, inside Docker)
  |
  +--> SQLite (WAL mode, volume-mounted)
  +--> Filesystem (document folders, thumbnails)
  +--> Elasticsearch (rag_anything indices) — chunk import + write-back
  +--> MinIO (rag_anything assets) — images, tables, thumbnails, markdown
  +--> Qwen LLM API (llm-host:9000) — scoring, suggestions, AI review
  +--> BGE-M3 Embedding API (embedding-host:8000) — semantic chunking + re-embedding on edit
```

---

## Backend

### Application Entry Point

`backend/main.py` — FastAPI app with lifespan handler that initializes the database and seeds default users. Mounts static frontend assets and a catch-all SPA route.

### Configuration

`backend/config.py` — Pydantic Settings class reading from environment variables:
- `db_path` — SQLite database file location
- `secret_key` — JWT signing key
- `embedding_endpoint` — BGE-M3 embedding server URL
- `thumbnail_dir` — directory for generated page thumbnails

### Authentication

`backend/auth.py` — JWT-based authentication (HS256, 24-hour expiry). Supports both `Authorization: Bearer` header and `?token=` query parameter (for EventSource/img tags that cannot set headers).

`backend/seed.py` — Creates 3 default users on first startup (admin, reviewer1, reviewer2).

### Database

`backend/db.py` — SQLAlchemy engine with SQLite WAL mode and foreign key enforcement. Schema migrations handled via `ALTER TABLE` statements in `init_db()` (no Alembic).

`backend/models.py` — ORM models:

| Model | Table | Purpose |
|-------|-------|---------|
| User | users | Authentication accounts |
| Document | documents | Loaded document metadata + AI review results |
| Chunk | chunks | Text chunks with chunking params and LLM scores |
| ChunkEdit | chunk_edits | Per-user chunk content edits (original + modified) |
| ChunkFeedback | chunk_feedback | Per-user emoji + comment feedback |
| ChunkImage | chunk_images | Image references extracted from chunk content |

Key relationships:
- Document -> Chunk (one-to-many, cascade delete)
- Chunk -> ChunkEdit, ChunkFeedback, ChunkImage (one-to-many, cascade delete)
- ChunkEdit and ChunkFeedback are unique per (chunk_id, user_id)

### API Routers

#### Documents (`backend/api/documents.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/documents/load | Load document from folder path. Finds metadata.json, creates DB record, generates thumbnails, triggers AI review in background. |
| GET | /api/documents | List all documents |
| GET | /api/documents/{id} | Get document with full metadata and parsing metrics |
| DELETE | /api/documents/{id} | Delete document (cascades to chunks, edits, feedback) |
| GET | /api/documents/{id}/ai-review | Get AI chunking strategy review |
| POST | /api/documents/{id}/ai-review/retry | Re-trigger AI review |

#### Files (`backend/api/files.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/documents/{id}/markdown | Full markdown content |
| GET | /api/documents/{id}/page/{num}/markdown | Single page markdown |
| GET | /api/documents/{id}/page/{num}/thumbnail | Page thumbnail JPEG |
| GET | /api/documents/{id}/images/{name} | Document image file |
| GET | /api/documents/{id}/tables/{name} | Table image file |
| GET | /api/documents/{id}/layout-pdf | Layout analysis PDF |

#### Views (`backend/api/views.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/documents/{id}/text-only | Extracted text paragraphs |
| GET | /api/documents/{id}/tables-only | Table images, markdown tables, and HTML table map |
| GET | /api/documents/{id}/images-only | Images with captions and categories |

#### Elasticsearch Documents (`backend/api/es_documents.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/es/indices | List ES indices (filtered to `rag-anything-glmhybridocr-*`) |
| GET | /api/es/documents?index=X | List unique documents in an index (aggregated by parent_doc_id) |
| POST | /api/es/documents/{parent_doc_id}/import | Import ES document into SQLite; triggers background AI review |
| POST | /api/es/documents/{document_id}/refresh | Re-fetch chunks from ES, replacing local copies |

#### Chunks (`backend/api/chunks.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/documents/{id}/chunk | Trigger chunking with selected strategy and parameters |
| GET | /api/documents/{id}/chunks | Paginated chunk list with search |
| GET | /api/documents/{id}/chunks/{cid} | Single chunk detail |
| PUT | /api/chunks/{cid}/edit | Save edited chunk content; syncs to ES with re-embedding if strategy matches |
| GET | /api/chunks/{cid}/diff | Get original vs modified content |
| DELETE | /api/documents/{id}/chunks | Delete all chunks for a document |
| DELETE | /api/chunks/{cid}/edit | Revert chunk edit; restores original content in ES |
| GET | /api/documents/{id}/chunk-status | SSE: async chunking progress (semantic strategy) |
| GET | /api/documents/{id}/evaluate-chunks | SSE: parallel LLM evaluation with streaming results |

#### Feedback (`backend/api/feedback.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | /api/chunks/{cid}/feedback | Upsert emoji + comment (independent, emoji nullable) |
| GET | /api/chunks/{cid}/feedback | Get user's feedback |

#### Filesystem (`backend/api/filesystem.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/filesystem/browse | Browse server directories for document loading |

### Service Layer

#### Chunking (`backend/services/chunking.py`)

Five strategies for splitting markdown into chunks:

| Strategy | Method | Best for |
|----------|--------|----------|
| Character | Fixed character count split | Simple, predictable chunk sizes |
| Recursive | Split by paragraphs, then sentences, then characters | General-purpose, respects sentence boundaries |
| Markdown | Split on Markdown headers (# ## ###) and paragraphs | Structured documents with clear heading hierarchy |
| Semantic | Split by embedding similarity (BGE-M3) | Documents where topic boundaries don't align with formatting |
| Page-wise | Split on `---` page delimiters | Preserving original page structure |

#### LLM Evaluation (`backend/services/llm_eval.py`)

Uses the deployed Qwen/Qwen3.5-122B-A10B model (64k max context) for three evaluation tasks:

1. **RAG/FAQ Scoring** — Evaluates each chunk on a 0-10 scale for RAG usability (RAGの使いやすさ) and FAQ usability (FAQの使いやすさ) using a structured rubric prompt with 5 criteria each.
2. **AI Suggestion** (AI提案) — Multimodal comparison of chunk text against the source page thumbnail image, reporting extraction errors.
3. **Chunking Strategy Review** (AIレビュー) — Two-phase document analysis:
   - **Phase 1 (Analysis)**: The full document markdown is sent to the LLM (split into ~50k char parts if the document exceeds that, with parallel analysis of each part). The LLM measures exact section sizes, table dimensions, and structural patterns.
   - **Phase 2 (Recommendation)**: Analysis results are fed into a second prompt that generates document-specific strategy recommendations, citing actual section names and measured character counts.

RAG/FAQ scoring and AI suggestion run in parallel per chunk via `asyncio.gather`. Evaluation auto-triggers after chunking completes. A shared `httpx.AsyncClient` with `trust_env=False` handles connection pooling without inheriting proxy settings.

#### Other Services

- `backend/services/es_client.py` — Singleton Elasticsearch client with two write functions: `find_es_doc_id()` (finds the ES `_id` by `parent_doc_id` + `chunk_id`) and `update_es_chunk()` (updates content and embedding vector).
- `backend/services/minio_client.py` — MinIO client for fetching bytes/text, listing objects, and checking existence. Used to proxy images, tables, thumbnails, and markdown from the rag_anything bucket.
- `backend/services/markdown_parser.py` — Extracts text paragraphs, tables, image references, and table HTML mappings from the OCR-generated markdown. The `extract_table_html_map()` function parses the `![](tables/FILENAME)` + `<table>...</table>` pattern to map table images to their extracted HTML content.
- `backend/services/embedding.py` — Calls the BGE-M3 embedding endpoint for semantic chunking and for re-embedding edited chunks before ES write-back.
- `backend/services/pdf_thumbnails.py` — Generates JPEG page thumbnails from layout PDFs using PyMuPDF.

---

## Frontend

### Technology

- **React 19** with TypeScript
- **Zustand** for state management
- **Axios** for HTTP requests
- **Framer Motion** for animations
- **PDF.js** for PDF rendering
- **Vite** for build tooling

### State Management

Three Zustand stores:

| Store | Key State | Purpose |
|-------|-----------|---------|
| authStore | user, token, isAuthenticated | JWT auth lifecycle |
| documentStore | documents[], selectedDocument, viewMode | Document selection and view switching |
| chunkStore | chunks[], selectedChunk, page, isChunking | Chunk data, pagination, chunking/evaluation state |

### View Modes

The sidebar offers 5 view modes, each rendering a different main content component:

| Mode | Component | Description |
|------|-----------|-------------|
| チャンク (Chunks) | ThumbnailPanel + ChunkTable + ViewerEditor | Primary workspace: page thumbnails, chunk table with scores, and chunk editor in a resizable split layout |
| Markdown | MarkdownView | Split pane: rendered markdown (left) + auto-synced page thumbnails (right) with resizable divider |
| テーブル (Tables) | TablesOnlyView | Table images from `tables/` folder; click to open modal with image + extracted HTML table |
| 画像 (Images) | ImagesOnlyView | Image gallery with captions, categorized by type |
| AIレビュー (AI Review) | AIReviewView | LLM-generated chunking strategy recommendations |

### Key UI Patterns

- **Resizable split panes** — ChunkTable/ViewerEditor vertical split; MarkdownView horizontal split; Sidebar width — all via mouse drag handlers.
- **SSE streaming** — Chunk evaluation results stream in real-time via EventSource, updating individual cells without refetching the full table.
- **Image modal with navigation** — Unified modal for page thumbnails, document images, and table images with prev/next buttons and directional slide animations (250ms). Supports both markdown and raw HTML rendering in the right pane (HTML tables detected automatically).
- **Page-synced scrolling** — In Markdown view, scrolling the text pane auto-scrolls the thumbnail pane to the corresponding page based on scroll position detection.

### API Layer

`frontend/src/api/client.ts` — Axios instance with:
- Base URL `/api`
- Automatic `Authorization: Bearer` header injection from localStorage
- `withToken(path)` helper for constructing authenticated image URLs

Type-safe API modules: `auth.ts`, `documents.ts`, `chunks.ts`, `feedback.ts` — each exports typed request/response interfaces and async functions.

---

## Data Flow

### Document Loading

1. User browses filesystem via FolderLoadDialog
2. `POST /api/documents/load` with folder path
3. Server finds `metadata.json`, creates Document record, generates page thumbnails
4. Background `asyncio.create_task` launches two-phase AI review (Phase 1: analyze full document structure, Phase 2: generate document-specific chunking recommendations)
5. Frontend polls AI review status until complete; results displayed in AIレビュー view

### Chunking and Evaluation

1. User selects strategy and parameters in ChunkTable toolbar
2. `POST /api/documents/{id}/chunk` creates chunks in DB
3. After chunking completes, LLM evaluation auto-triggers — frontend opens SSE connection to `GET /api/documents/{id}/evaluate-chunks`
4. Backend launches all chunk evaluations concurrently via `asyncio.create_task`
5. Per chunk: RAG/FAQ scoring and AI suggestion run in parallel via `asyncio.gather`
6. Results pushed to `asyncio.Queue`, streamed as SSE events
7. Frontend updates individual chunk scores in Zustand store via `updateChunkEval()`

### Chunk Edit + ES Write-back

1. User edits chunk content in ViewerEditor; undo/redo history tracked in component state (Ctrl+Z / Ctrl+Shift+Z)
2. On save — `PUT /api/chunks/{id}/edit` upserts a `ChunkEdit` row in SQLite
3. `_sync_chunk_to_es()` checks: is this an ES-sourced document? Does the chunk's current strategy match the document's original ES strategy? If both yes — re-embeds the new content via BGE-M3, then calls `update_es_chunk()` to update both `content` and `embedding` fields in ES
4. Response includes `es_synced: true/false`; frontend shows a status badge
5. On revert — `DELETE /api/chunks/{id}/edit` removes the edit and restores original content + embedding in ES via the same path

### Feedback

1. User selects emoji from dropdown in ChunkTable — `PUT /api/chunks/{id}/feedback` with existing comment preserved
2. User clicks comment cell to inline-edit — `PUT /api/chunks/{id}/feedback` with existing emoji preserved
3. Emoji and comment are independent (emoji nullable)

---

## External Dependencies

| Service | Host | Purpose |
|---------|------|---------|
| Qwen/Qwen3.5-122B-A10B | llm-host:9000 | LLM scoring, AI suggestions, chunking review |
| BGE-M3 | embedding-host:8000 | Text embeddings for semantic chunking and ES re-embedding |
| Elasticsearch 8.x | elasticsearch-host:9200 | rag_anything chunk index — read (import) and write (edit sync) |
| MinIO | minio-host:9000 | rag_anything asset storage — images, tables, thumbnails, markdown |

---

## Deployment

### Docker (production)

```
Docker container (data-viewer)
  └── Uvicorn (single worker)
        └── FastAPI app
              └── Serves pre-built frontend/dist/ as static files
```

- **Image**: Multi-stage build — Node 22 Alpine builds the React frontend; Python 3.10 slim serves it
- **Data volume**: `./data` mounted at `/app/data` for SQLite DB and page thumbnails
- **Config**: `.env` file via `env_file` in `docker-compose.yml`
- **Port**: `${PORT:-8080}` (host) → 8080 (container)

```bash
docker compose up -d --build   # start
docker compose down            # stop
docker logs data-viewer -f     # logs
```

### Local development

```bash
# Backend with hot reload
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085 --reload

# Frontend dev server (HMR, proxies /api to :8085)
cd frontend && npm run dev
```

- **Database**: SQLite file with WAL journal mode
- **Frontend**: Pre-built SPA served as static files from `frontend/dist/`
- **CORS**: All origins allowed (intranet deployment)
