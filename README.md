# Data Viewer — RAG Anything

A full-stack platform for reviewing, chunking, and evaluating PDF documents processed through the **rag_anything** OCR/extraction pipeline. Supports both local document folders and Elasticsearch + MinIO as source, with LLM-based quality scoring, human feedback collection, and bi-directional chunk editing that syncs back to Elasticsearch.

## Features

- **ES + MinIO Integration** — Browse rag_anything Elasticsearch indices, import documents, serve images/tables/thumbnails/markdown from MinIO
- **Document Management** — Load local pre-processed PDF folders or import from Elasticsearch; browse with page thumbnails
- **Multi-Strategy Chunking** — 6 strategies: character, recursive, markdown, page + markdown, semantic (BGE-M3 embeddings), page-wise
- **ES Write-back** — Chunk edits sync back to Elasticsearch with re-embedding via BGE-M3; skipped if a different chunking strategy is selected
- **LLM Quality Evaluation** — RAG usability and FAQ usability scores (0–10) via Qwen3.5-122B as judge, with multimodal AI suggestions comparing chunk text against page images
- **AI Chunking Review** — Automatic LLM analysis recommending optimal chunking strategy and parameters per document
- **Human Feedback** — Per-chunk emoji feedback (✅ ❌ ✏️ ❓ 〜) and comments, chunk content editing with diff tracking and undo/redo
- **Rich Viewing Modes** — Chunks, Markdown (page-synced split view), Tables (image + extracted HTML viewer), Images, AI Review
- **Real-Time Streaming** — SSE-based chunking progress and LLM evaluation results streamed per-chunk

## Architecture

```
Browser (React 19 + TypeScript + Zustand)
          |
    FastAPI + SQLAlchemy + SQLite (Docker + Uvicorn)
          |
    +-----+----------+----------+
    |                |          |
Elasticsearch     MinIO      Qwen LLM      BGE-M3
(chunk source)  (assets)  (llm-host:9000) (embedding-host:8000)
```

See [documentation/system_architecture.md](documentation/system_architecture.md) for detailed architecture.

## Prerequisites

**For Docker deployment (recommended):**
- Docker + Docker Compose

**For local development:**
- Python 3.10+
- Node.js 18+

Both require network access to:
- Qwen LLM endpoint (`llm-host:9000`) — for evaluation and AI review
- BGE-M3 embedding endpoint (`embedding-host:8000`) — for semantic chunking and ES re-embedding
- Elasticsearch (`elasticsearch-host:9200`) — for ES document import
- MinIO (`minio-host:9000`) — for asset serving

## Setup

### Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key variables:

```env
DB_PATH=data/data_viewer.db
SECRET_KEY=your-secret-key
PORT=8080

# Embedding (BGE-M3)
EMBEDDING_ENDPOINT=http://embedding-host:8000
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=BAAI/bge-m3

# Elasticsearch
ES_URL=https://elasticsearch-host:9200
ES_USER=__REDACTED_ES_USER__
ES_PASSWORD=...
ES_VERIFY_CERTS=false

# MinIO
MINIO_ENDPOINT=minio-host:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=rag-anything
MINIO_SECURE=false
```

## Running

### Docker (recommended)

```bash
# First run — build image and start
docker compose up -d --build

# After code changes — rebuild and restart
docker compose build && docker compose up -d

# View logs
docker logs data-viewer -f

# Stop
docker compose down
```

The application will be available at `http://localhost:${PORT}` (default `8080`).

### Local Development

```bash
# Backend with hot reload
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085 --reload

# Frontend dev server (separate terminal)
cd frontend && npm run dev
```

Frontend dev server proxies `/api` to the backend and runs on `http://localhost:5173`.

## Usage

1. **Login** with default credentials (see [Default Users](#default-users))
2. **Load a document** — two ways:
   - **Local folder** — click `+` in the sidebar, browse to a folder containing `metadata.json` and `*_with_captions.mmd`
   - **Elasticsearch** — click the ES import button, select an index (only `rag-anything-glmhybridocr-*` indices are shown), pick a document
3. **Select a view mode** from the sidebar:
   - **Chunks** — chunk the document, view/edit chunks, run LLM evaluation
   - **Markdown** — split view with page-synced scrolling
   - **Tables** — table images with extracted HTML viewer
   - **Images** — image gallery with captions
   - **AI Review** — LLM-recommended chunking strategy
4. **Chunk the document** — select strategy and parameters; the dropdown defaults to the strategy used in ES. LLM evaluation starts automatically after chunking
5. **Edit chunks** — edit content in the Viewer/Editor panel; use undo/redo buttons or Ctrl+Z / Ctrl+Shift+Z. Saving syncs the edit (with re-embedding) back to the originating ES index if the chunking strategy matches
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
- [ES + MinIO Integration](documentation/elasticsearch-minio-integration.md) — rag_anything pipeline integration
- [Chunk Evaluation Scoring](documentation/chunk-evaluation-scoring.md) — LLM scoring methodology and rubrics
- [Architecture Decision Records](documentation/ADR.md) — major design decisions and rationale

## Default Users

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Administrator |
| reviewer1 | reviewer1 | Reviewer |
| reviewer2 | reviewer2 | Reviewer |
