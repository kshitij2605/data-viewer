# CLAUDE.md

## Project Overview

Data Viewer is a full-stack platform for visualizing, chunking, and evaluating OCR-processed PDF documents for RAG (Retrieval-Augmented Generation) usability. Users load pre-processed document folders, apply text-chunking strategies, get LLM-scored quality evaluations, and provide human feedback.

## Tech Stack

- **Frontend**: React 19 + TypeScript, Vite, Zustand (state), Framer Motion (animations), react-router-dom, pdf.js, react-markdown
- **Backend**: Python FastAPI + SQLAlchemy 2.0, SQLite (WAL mode), JWT auth (PyJWT + passlib/bcrypt)
- **LLM**: Qwen3.5-122B via OpenAI-compatible endpoint (llm-host:9000/v1)
- **Embeddings**: BGE-M3 via embedding endpoint (embedding-host:8000)
- **PDF Processing**: PyMuPDF for thumbnails, langchain-text-splitters for chunking
- **External Storage**: Elasticsearch 8.x (chunk source from rag_anything), MinIO (images, tables, markdown, thumbnails)

## Repository Structure

```
backend/
  api/          # 8 FastAPI route modules (auth, documents, es_documents, chunks, files, feedback, views, filesystem)
  services/     # Business logic (chunking, llm_eval, embedding, markdown_parser, pdf_thumbnails, es_client, minio_client)
  main.py       # App entry point, lifespan, CORS, static file serving
  config.py     # Pydantic Settings (reads .env)
  db.py         # SQLAlchemy engine + migrations
  models.py     # 6 ORM models (users, documents, chunks, chunk_edits, chunk_feedback, chunk_images)
  auth.py       # JWT security dependency
  seed.py       # Default user creation
frontend/
  src/
    components/ # 17 React components (ChunkTable, ViewerEditor, MarkdownView, ImageModal, etc.)
    stores/     # 3 Zustand stores (auth, document, chunk)
    api/        # Axios client + 4 API modules
    styles/     # Global CSS
  App.tsx       # Root layout + 5 view modes + SSE streaming
tests/          # pytest: auth, documents, chunks, feedback, markdown_parser, chunking_service
documentation/  # Architecture docs, scoring rubrics, ADRs
```

## Common Commands

```bash
# Backend dev (hot reload)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085 --reload

# Frontend dev (proxies /api to backend)
cd frontend && npm run dev

# Frontend build
cd frontend && npm run build

# Lint frontend
cd frontend && npm run lint

# Run all tests
pytest tests/

# Production start (builds frontend + starts uvicorn)
./start.sh
```

## Environment Variables

Configured in `.env` (see `.env.example`):
- `EMBEDDING_ENDPOINT` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` - BGE-M3 embedding service
- `DB_PATH` - SQLite database path (default: `data/data_viewer.db`)
- `SECRET_KEY` - JWT signing key
- `PORT` - Server port (default: 8080)
- `ES_URL` / `ES_USER` / `ES_PASSWORD` - Elasticsearch connection (for rag_anything integration)
- `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` - MinIO object storage

## Key Architecture Patterns

- **Single-server deployment**: Backend serves the built frontend from `frontend/dist/` and mounts `/assets`
- **Dual data source**: Documents can come from local folders (`source_type=local`) or Elasticsearch+MinIO (`source_type=elasticsearch`). File-serving endpoints branch transparently based on `doc.source_type`
- **ES import flow**: User selects an ES index → picks documents → backend fetches chunks from ES and creates SQLite rows → existing feedback/editing/evaluation features work on imported data
- **MinIO proxy**: Images, tables, thumbnails, markdown fetched from MinIO through backend proxy endpoints (same URLs as local files, transparent to frontend)
- **JWT auth**: Token stored in localStorage, injected via Axios interceptor. Image tags use `withToken()` helper to append `?token=` query param
- **SSE streaming**: Chunk evaluation scores stream in real-time via Server-Sent Events (sse-starlette)
- **Resizable split panes**: Drag dividers in chunk view (ThumbnailPanel | ChunkTable | ViewerEditor)
- **Page-synced scrolling**: Markdown view auto-scrolls thumbnails based on content scroll position

## Five Chunking Strategies

1. **Character** - Fixed-size character splits
2. **Recursive** - Respects Japanese/Markdown separators
3. **Markdown** - Header-aware hierarchical splitting
4. **Semantic** - BGE-M3 embedding similarity clustering
5. **Page-wise** - One chunk per page (splits on `---` delimiter)

## Database

SQLite with 6 tables: `users`, `documents`, `chunks`, `chunk_edits`, `chunk_feedback`, `chunk_images`. Migrations run automatically on startup via `db.py`.

## Default Users (auto-seeded)

- `admin` / `admin`, `reviewer1` / `reviewer1`, `reviewer2` / `reviewer2`

## UI is primarily in Japanese

Component labels, view mode names, and LLM evaluation prompts use Japanese text.
