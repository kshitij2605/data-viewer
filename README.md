# Data Viewer — RAG Anything

A full-stack platform for reviewing, chunking, and evaluating PDF documents processed through the **rag_anything** OCR/extraction pipeline. Supports three document sources — local document folders, Elasticsearch + MinIO, and the **Veda** vector database — with LLM-based quality scoring, human feedback collection, and bi-directional chunk editing that syncs back to Elasticsearch.

## Features

- **ES + MinIO Integration** — Browse rag_anything Elasticsearch indices, import documents, serve images/tables/thumbnails/markdown from MinIO
- **Veda Vector DB Integration** — Browse Veda collections over its REST API, import documents (chunks grouped by `parent_doc_id`); markdown is reconstructed from chunk contents (text-only, read-only import)
- **Document Management** — Load local pre-processed PDF folders, or import from Elasticsearch or Veda; browse with page thumbnails
- **Multi-Strategy Chunking** — 5 strategies: character, recursive, markdown, semantic (BGE-M3 embeddings), page-wise
- **ES Write-back** — Chunk edits sync back to Elasticsearch with re-embedding via BGE-M3; skipped if a different chunking strategy is selected
- **LLM Quality Evaluation** — RAG usability and FAQ usability scores (0–10) via Qwen3.5-122B as judge, with multimodal AI suggestions comparing chunk text against page images
- **AI Chunking Review** — Automatic LLM analysis recommending optimal chunking strategy and parameters per document
- **Human Feedback** — Per-chunk emoji feedback (✅ ❌ ✏️ ❓ 〜) and comments, chunk content editing with diff tracking and undo/redo
- **Rich Viewing Modes** — Chunks, Markdown (page-synced split view), Tables (image + extracted HTML viewer), Images, AI Review
- **Real-Time Streaming** — SSE-based chunking progress and LLM evaluation results streamed per-chunk
- **LDAP / Active Directory login** — Authenticates against AD when `LDAP_URL` is configured; falls back to local accounts when not set

## Architecture

```
Browser (React 19 + TypeScript + Zustand)
          |
     nginx (reverse proxy, asset cache, rate limits)
          |
   gunicorn + 4 × uvicorn workers
   FastAPI + SQLAlchemy
          |
    +-----+----------+----------+---------+
    |                |          |         |
PostgreSQL        MinIO      Qwen LLM   BGE-M3
(data_viewer DB) (assets)  (llm-host) (embedding-host)
          |
    +-----+--------------+
    |                    |
Elasticsearch         Veda
(chunk source)   (vector DB source)
```

See [documentation/system_architecture.md](documentation/system_architecture.md) for full technical detail.

## Prerequisites

**For Docker deployment (recommended):**
- Docker + Docker Compose
- PostgreSQL server reachable from the container (or leave `DATABASE_URL` empty to use SQLite)

**For local development:**
- Python 3.10+
- Node.js 18+

Both require network access to:
- Qwen LLM endpoint (`llm-host:9000`) — for evaluation and AI review
- BGE-M3 embedding endpoint (`embedding-host:8000`) — for semantic chunking and ES re-embedding
- Elasticsearch (`elasticsearch-host:9200`) — for ES document import
- MinIO (`minio-host:9000`) — for asset serving
- Veda (`veda-host:6340`) — for Veda vector DB document import (optional)

## Setup

### Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key variables:

```env
# Database — leave DATABASE_URL empty to use SQLite at DB_PATH
DB_PATH=data/data_viewer.db
DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/data_viewer

SECRET_KEY=your-secret-key-min-32-chars
PORT=8080

# Production scaling
WEB_CONCURRENCY=4          # gunicorn worker processes
LLM_MAX_CONCURRENCY=6      # per-worker cap on in-flight Qwen requests
LLM_MAX_RETRIES=3
LLM_TIMEOUT=60
AI_SUGGESTION_IMAGE_MAX_PX=1024

# Embedding (BGE-M3)
EMBEDDING_ENDPOINT=http://embedding-host:8000
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=BAAI/bge-m3

# Elasticsearch
ES_URL=https://elasticsearch-host:9200
ES_USER=REDACTED
ES_PASSWORD=...
ES_VERIFY_CERTS=false

# Veda vector database — leave VEDA_URL empty to disable
VEDA_URL=http://veda-host:6340
VEDA_TOKEN=          # optional bearer token, if Veda requires auth

# MinIO
MINIO_ENDPOINT=minio-host:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=rag-anything
MINIO_SECURE=false

# LDAP / Active Directory (leave LDAP_URL empty to disable AD login)
LDAP_URL=ldap://dc.example.com:389
LDAP_BIND_DN=svcaccount@DOMAIN.COM
LDAP_BIND_CREDENTIALS=...
LDAP_USER_SEARCH_BASE=DC=DOMAIN,DC=COM
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
```

## Running

### Docker (recommended)

The production stack runs two containers: **data-viewer** (gunicorn app) and **data-viewer-nginx** (reverse proxy).

```bash
# First run — build image and start both containers
docker compose up -d --build

# After code changes — rebuild app and restart
docker compose build data-viewer && docker compose up -d --force-recreate data-viewer

# View logs
docker logs data-viewer -f
docker logs data-viewer-nginx -f

# Stop
docker compose down
```

The application is available at `http://localhost:${PORT}` (default `8080`). nginx listens on the host port; gunicorn binds internally on `8080`.

### Local Development

```bash
# Backend with hot reload (single worker, SQLite)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085 --reload

# Frontend dev server (separate terminal)
cd frontend && npm run dev
```

Frontend dev server proxies `/api` to the backend and runs on `http://localhost:5173`.

## Usage

1. **Login** — with your Active Directory account (if `LDAP_URL` is configured) or with a local account (see [Default Users](#default-users))
2. **Load a document** — three ways:
   - **Local folder** — click `+` in the sidebar, browse to a folder containing `metadata.json` and `*_with_captions.mmd`
   - **Elasticsearch** — click `+` in the sidebar, choose the **Elasticsearch** tab, select an index, pick a document
   - **Veda** — click `+` in the sidebar, choose the **Veda** tab, select a collection, pick a document
3. **Select a view mode** from the sidebar:
   - **Chunks** — chunk the document, view/edit chunks, run LLM evaluation
   - **Markdown** — split view with page-synced scrolling
   - **Tables** — table images with extracted HTML viewer
   - **Images** — image gallery with captions
   - **AI Review** — LLM-recommended chunking strategy
4. **Chunk the document** — select strategy and parameters; the dropdown defaults to the strategy used in ES
5. **Edit chunks** — edit content in the Viewer/Editor panel; use undo/redo or Ctrl+Z / Ctrl+Shift+Z. Saving syncs back to the originating ES index if the chunking strategy matches
6. **Provide feedback** — use emoji reactions, inline comments, or the diff view

## Local Document Folder Structure

```
document_folder/
  metadata.json            # {pdf_title, num_pages, num_images, num_tables}
  *_with_captions.mmd      # Markdown with extracted content and image refs
  *_layouts.pdf            # Layout-annotated PDF (for thumbnails)
  images/                  # Extracted figures
  tables/                  # Extracted table images
```

## Documentation

- [System Architecture](documentation/system_architecture.md) — detailed technical architecture
- [Deployment Guide](documentation/DEPLOYMENT_GUIDE.md) — step-by-step production deployment
- [ES + MinIO Integration](documentation/elasticsearch-minio-integration.md) — rag_anything pipeline integration
- [Chunk Evaluation Scoring](documentation/chunk-evaluation-scoring.md) — LLM scoring methodology and rubrics
- [Architecture Decision Records](documentation/ADR.md) — major design decisions and rationale
- [Production Changes](documentation/PRODUCTION_CHANGES.md) — production hardening change log

## Default Users

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Administrator |
| reviewer1 | reviewer1 | Reviewer |
| reviewer2 | reviewer2 | Reviewer |

> **Note:** When `LDAP_URL` is set, local accounts (including the defaults above) are disabled — all logins go through Active Directory. Set `LDAP_URL=` (empty) to re-enable local accounts.
