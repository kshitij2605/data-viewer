# System Architecture

## Overview

Data Viewer is a full-stack application for reviewing PDF documents that have been processed through an OCR/extraction pipeline. It enables users to view extracted content (markdown, tables, images), chunk the text using multiple strategies, evaluate chunk quality via LLM-as-a-Judge, and provide human feedback.

**Stack**: FastAPI (Python) + React (TypeScript) + SQLite + Qwen LLM

---

## High-Level Architecture

```
Browser (React SPA)
  |
  |  HTTP / SSE
  v
FastAPI Server (Uvicorn)
  |
  +--> SQLite (WAL mode)
  +--> Filesystem (document folders, thumbnails)
  +--> Qwen LLM API (llm-host:9000) — scoring, suggestions, AI review
  +--> BGE-M3 Embedding API (embedding-host:8000) — semantic chunking
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
| GET | /api/documents/{id}/layout-pdf | Layout analysis PDF |

#### Views (`backend/api/views.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/documents/{id}/text-only | Extracted text paragraphs |
| GET | /api/documents/{id}/tables-only | Markdown tables with descriptions |
| GET | /api/documents/{id}/images-only | Images with captions and categories |

#### Chunks (`backend/api/chunks.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/documents/{id}/chunk | Trigger chunking with selected strategy and parameters |
| GET | /api/documents/{id}/chunks | Paginated chunk list with search |
| GET | /api/documents/{id}/chunks/{cid} | Single chunk detail |
| PUT | /api/chunks/{cid}/edit | Save edited chunk content |
| GET | /api/chunks/{cid}/diff | Get original vs modified content |
| DELETE | /api/chunks/{cid}/edit | Revert chunk edit |
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

- `backend/services/markdown_parser.py` — Extracts text paragraphs, tables, and image references from the OCR-generated markdown.
- `backend/services/embedding.py` — Calls the BGE-M3 embedding endpoint for semantic chunking.
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
| テーブル (Tables) | TablesOnlyView | Extracted tables with context descriptions |
| 画像 (Images) | ImagesOnlyView | Image gallery with captions, categorized by type |
| AIレビュー (AI Review) | AIReviewView | LLM-generated chunking strategy recommendations |

### Key UI Patterns

- **Resizable split panes** — ChunkTable/ViewerEditor vertical split; MarkdownView horizontal split; Sidebar width — all via mouse drag handlers.
- **SSE streaming** — Chunk evaluation results stream in real-time via EventSource, updating individual cells without refetching the full table.
- **Image modal with navigation** — Unified modal for page thumbnails and document images with prev/next buttons and directional slide animations (250ms).
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

### Feedback

1. User selects emoji from dropdown in ChunkTable — `PUT /api/chunks/{id}/feedback` with existing comment preserved
2. User clicks comment cell to inline-edit — `PUT /api/chunks/{id}/feedback` with existing emoji preserved
3. User edits chunk content in ViewerEditor — `PUT /api/chunks/{id}/edit`
4. Emoji and comment are independent (emoji nullable)

---

## External Dependencies

| Service | Host | Purpose |
|---------|------|---------|
| Qwen/Qwen3.5-122B-A10B | llm-host:9000 | LLM scoring, AI suggestions, chunking review |
| BGE-M3 | embedding-host:8000 | Text embeddings for semantic chunking |

---

## Deployment

- **Server**: veda-host:8085
- **Process**: Uvicorn with `--reload` for development
- **Database**: SQLite file with WAL journal mode
- **Frontend**: Pre-built SPA served as static files from `frontend/dist/`
- **CORS**: All origins allowed (intranet deployment)
