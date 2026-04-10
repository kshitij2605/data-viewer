# Data Viewer

A document analysis and chunk quality evaluation tool for reviewing PDF documents processed through an OCR/extraction pipeline. Enables multi-strategy text chunking, LLM-based quality scoring, and human feedback collection.

## Features

- **Document Management** — Load pre-processed PDF folders (markdown + metadata + images), browse with page thumbnails
- **Multi-Strategy Chunking** — 5 strategies: character, recursive, markdown, semantic (BGE-M3 embeddings), and page-wise
- **LLM Quality Evaluation** — RAG usability and FAQ usability scores (0-10) via Qwen3.5-122B-A10B as judge, with multimodal AI suggestions comparing chunk text against page images
- **AI Chunking Review** — Automatic LLM analysis recommending optimal chunking strategy and parameters per document
- **Human Feedback** — Per-chunk emoji feedback and comments, chunk content editing with diff tracking
- **Rich Viewing Modes** — Chunks, Markdown (page-synced split view), Tables (image + extracted HTML viewer), Images, AI Review
- **Real-Time Streaming** — SSE-based evaluation progress with per-chunk score updates

## Architecture

```
React (TypeScript) + Zustand + Framer Motion
          |
    FastAPI + SQLAlchemy + SQLite
          |
    +-----+------+
    |             |
Qwen LLM      BGE-M3
(llm-host)   (embedding-host)
```

See [documentation/system_architecture.md](documentation/system_architecture.md) for detailed architecture.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Access to the Qwen LLM endpoint (`llm-host:9000`)
- Access to the BGE-M3 embedding endpoint (`embedding-host:8000`) for semantic chunking

## Setup

### Backend

```bash
pip install -r backend/requirements.txt
```

Create a `.env` file (or set environment variables):

```env
DB_PATH=./data/data_viewer.db
SECRET_KEY=your-secret-key
EMBEDDING_ENDPOINT=http://embedding-host:8000/embeddings
THUMBNAIL_DIR=./data/thumbnails
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

## Running

### Development

```bash
# Start backend with hot reload
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085 --reload

# Frontend dev server (optional, for HMR)
cd frontend && npm run dev
```

### Production

```bash
# Build frontend
cd frontend && npm run build

# Start server (serves both API and built frontend)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8085
```

The application will be available at `http://localhost:8085`.

## Usage

1. **Login** with default credentials (`admin` / `password`)
2. **Load a document** — click `+` in the sidebar, browse to a folder containing `metadata.json` and the processed markdown file (`*_with_captions.mmd`)
3. **Select a view mode** from the sidebar:
   - **Chunks** — chunk the document, view/edit chunks, run LLM evaluation
   - **Markdown** — split view with page-synced scrolling
   - **Tables** — table images with click-to-view extracted HTML tables
   - **Images** — image gallery with captions
   - **AI Review** — LLM-recommended chunking strategy
4. **Chunk the document** — select strategy and parameters, click the chunking button. LLM evaluation starts automatically after chunking.
5. **Review and provide feedback** — use emoji feedback, edit chunks, view AI suggestions

## Document Folder Structure

Each document folder should contain:

```
document_folder/
  metadata.json          # Required: {pdf_title, num_pages, num_images, num_tables}
  *_with_captions.mmd    # Markdown file with extracted content
  *_layouts.pdf          # Layout analysis PDF (for thumbnail generation)
  images/                # Extracted images (charts, figures, etc.)
  tables/                # Extracted table images (with HTML tables in .mmd)
```

## Documentation

- [System Architecture](documentation/system_architecture.md) — detailed technical architecture
- [Chunk Evaluation Scoring](documentation/chunk-evaluation-scoring.md) — LLM scoring methodology and rubrics
- [Architecture Decision Records](documentation/ADR.md) — major design decisions and rationale

## Default Users

| Username | Password | Role |
|----------|----------|------|
| admin | password | Administrator |
| reviewer1 | password | Reviewer |
| reviewer2 | password | Reviewer |
