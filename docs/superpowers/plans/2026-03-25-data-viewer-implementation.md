# Data Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the **frontend-design** skill for all frontend component development (Tasks 8-19).

**Goal:** Build a GUI visualizer for document parsing output with chunking, editing, feedback, and image viewing capabilities.

**Architecture:** Monolith FastAPI backend serving REST API + built React static files. SQLite for persistence. Five chunking strategies adapted from rag_anything. Zustand for frontend state. framer-motion for animations.

**Tech Stack:** Python 3.10, FastAPI, SQLAlchemy, SQLite, PyMuPDF, langchain-text-splitters, React 18, TypeScript, Vite, Zustand, framer-motion, react-markdown, pdfjs-dist, react-diff-viewer-continued

**Spec:** `docs/superpowers/specs/2026-03-25-data-viewer-design.md`

**Example data:** `/home/mac/25gitlab/deepseek-ocr-api/examples/output/`

---

## File Structure

### Backend (`backend/`)

| File | Responsibility |
|------|---------------|
| `backend/__init__.py` | Package init |
| `backend/main.py` | FastAPI app, CORS, static files mount, lifespan (DB init) |
| `backend/config.py` | Pydantic Settings: DB path, embedding endpoint/key/model, port |
| `backend/db.py` | SQLAlchemy engine, session factory, WAL + foreign_keys pragmas |
| `backend/models.py` | ORM models: User, Document, Chunk, ChunkEdit, ChunkFeedback, ChunkImage |
| `backend/auth.py` | JWT encode/decode, password hashing, get_current_user dependency |
| `backend/seed.py` | Seed 3 default users on first run |
| `backend/api/__init__.py` | Package init |
| `backend/api/auth.py` | POST login, POST logout, GET me |
| `backend/api/documents.py` | POST load, GET list, GET detail |
| `backend/api/chunks.py` | POST chunk, GET list (with search), GET detail, PUT edit, DELETE edit, GET diff, GET chunk-status SSE |
| `backend/api/feedback.py` | PUT feedback, GET feedback |
| `backend/api/files.py` | GET markdown, GET image, GET layout-pdf, GET page thumbnail |
| `backend/api/views.py` | GET text-only, GET tables-only, GET images-only |
| `backend/services/__init__.py` | Package init |
| `backend/services/chunking.py` | 5 chunking strategies: character, recursive, semantic, markdown, page-wise |
| `backend/services/embedding.py` | HTTP client for BGE-M3 embedding endpoint |
| `backend/services/markdown_parser.py` | Parse markdown: extract text blocks, tables, image references with captions |
| `backend/services/pdf_thumbnails.py` | Generate page thumbnails from layout PDF using PyMuPDF |

### Frontend (`frontend/`)

| File | Responsibility |
|------|---------------|
| `frontend/package.json` | Dependencies and scripts |
| `frontend/tsconfig.json` | TypeScript config |
| `frontend/vite.config.ts` | Vite config with API proxy |
| `frontend/index.html` | HTML entry point |
| `frontend/src/main.tsx` | React DOM render |
| `frontend/src/App.tsx` | Router, auth gate, layout shell |
| `frontend/src/api/client.ts` | Axios instance with JWT interceptor |
| `frontend/src/api/auth.ts` | Login/logout/me API calls |
| `frontend/src/api/documents.ts` | Document load/list/detail API calls |
| `frontend/src/api/chunks.ts` | Chunk CRUD, search, edit, diff, SSE status |
| `frontend/src/api/feedback.ts` | Feedback get/set API calls |
| `frontend/src/stores/authStore.ts` | Zustand: user, token, login/logout actions |
| `frontend/src/stores/documentStore.ts` | Zustand: selected document, documents list, view mode |
| `frontend/src/stores/chunkStore.ts` | Zustand: chunks, selected chunk, search, pagination, chunking state |
| `frontend/src/components/LoginPage.tsx` | Login form with animation |
| `frontend/src/components/Header.tsx` | Date/time, logo, company name, user info |
| `frontend/src/components/Sidebar.tsx` | File search, file tree, view switcher |
| `frontend/src/components/FolderLoadDialog.tsx` | Modal dialog for entering folder path |
| `frontend/src/components/ChunkTable.tsx` | Chunk table with chunking dropdown, pagination, row selection |
| `frontend/src/components/ViewerEditor.tsx` | Bottom editor panel, collapsible, save button |
| `frontend/src/components/ThumbnailPanel.tsx` | Page thumbnail, layout PDF minis, chunk image grid |
| `frontend/src/components/ImageModal.tsx` | Full-screen image with zoom/pan |
| `frontend/src/components/PdfViewer.tsx` | PDF.js viewer modal |
| `frontend/src/components/DiffView.tsx` | Side-by-side diff with revert button |
| `frontend/src/components/FeedbackPicker.tsx` | Emoji picker popover |
| `frontend/src/components/MarkdownView.tsx` | Full markdown render |
| `frontend/src/components/TextOnlyView.tsx` | Text-only extracted content |
| `frontend/src/components/TablesOnlyView.tsx` | Tables with descriptions |
| `frontend/src/components/ImagesOnlyView.tsx` | Image grid with captions |
| `frontend/src/components/Footer.tsx` | Footer bar with user status |
| `frontend/src/styles/global.css` | Global styles, CSS variables, animation defaults |

### Tests (`tests/`)

| File | Responsibility |
|------|---------------|
| `tests/__init__.py` | Package init |
| `tests/conftest.py` | Pytest fixtures: test DB, test client, auth headers |
| `tests/test_auth.py` | Auth endpoint tests |
| `tests/test_documents.py` | Document load/list/detail tests |
| `tests/test_chunks.py` | Chunking, search, edit, diff tests |
| `tests/test_feedback.py` | Feedback CRUD tests |
| `tests/test_chunking_service.py` | Unit tests for all 5 chunking strategies |
| `tests/test_markdown_parser.py` | Markdown parsing tests |

---

## Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `backend/__init__.py`, `backend/api/__init__.py`, `backend/services/__init__.py`
- Create: `backend/config.py`
- Create: `backend/requirements.txt`
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
# Python
__pycache__/
*.pyc
.env
data/
*.db

# Node
frontend/node_modules/
frontend/dist/

# IDE
.vscode/
.idea/

# Thumbnails cache
data/thumbnails/

# Superpowers
.superpowers/
```

- [ ] **Step 2: Create .env.example**

```
EMBEDDING_ENDPOINT=http://embedding-host:8000
EMBEDDING_API_KEY=REDACTED
EMBEDDING_MODEL=BAAI/bge-m3
DB_PATH=data/data_viewer.db
SECRET_KEY=REDACTED
PORT=8080
```

- [ ] **Step 3: Create backend/requirements.txt**

```
fastapi==0.115.3
uvicorn==0.32.0
sqlalchemy==2.0.36
pyjwt==2.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.1
httpx==0.28.1
pymupdf==1.25.3
langchain-text-splitters==1.0.0
numpy==1.26.4
pydantic-settings==2.11.0
python-multipart==0.0.12
sse-starlette==2.2.1
```

- [ ] **Step 4: Create backend/config.py**

```python
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    db_path: str = "data/data_viewer.db"
    secret_key: str = "REDACTED"
    port: int = 8080
    embedding_endpoint: str = "http://embedding-host:8000"
    embedding_api_key: str = "REDACTED"
    embedding_model: str = "BAAI/bge-m3"
    thumbnail_dir: str = "data/thumbnails"

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 5: Create backend package inits**

Create empty `__init__.py` in `backend/`, `backend/api/`, `backend/services/`.

- [ ] **Step 6: Scaffold frontend with Vite**

Run:
```bash
cd /home/mac/25gitlab/data_viewer && npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 7: Install frontend dependencies**

Run:
```bash
cd /home/mac/25gitlab/data_viewer/frontend && npm install zustand framer-motion react-markdown remark-gfm react-diff-viewer-continued pdfjs-dist axios react-router-dom
```

- [ ] **Step 8: Configure Vite proxy**

Create `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 9: Install backend dependencies**

Run:
```bash
cd /home/mac/25gitlab/data_viewer && pip install pymupdf sse-starlette python-multipart python-dotenv
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: scaffold project structure with backend and frontend dependencies"
```

---

## Task 2: Database Layer (Models + DB Setup)

**Files:**
- Create: `backend/db.py`
- Create: `backend/models.py`
- Create: `backend/seed.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Create backend/db.py**

```python
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.config import settings
from pathlib import Path

class Base(DeclarativeBase):
    pass

def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

def get_engine(db_path: str = None):
    path = db_path or settings.db_path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", echo=False)
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine

engine = get_engine()
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 2: Create backend/models.py**

All 6 ORM models matching the spec schema exactly: User, Document, Chunk, ChunkEdit, ChunkFeedback, ChunkImage. Include relationships.

- [ ] **Step 3: Create backend/seed.py**

```python
from passlib.hash import bcrypt
from backend.db import SessionLocal
from backend.models import User

def seed_users():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            users = [
                User(username="admin", password_hash=bcrypt.hash("admin"), display_name="Admin User"),
                User(username="reviewer1", password_hash=bcrypt.hash("reviewer1"), display_name="Reviewer 1"),
                User(username="reviewer2", password_hash=bcrypt.hash("reviewer2"), display_name="Reviewer 2"),
            ]
            db.add_all(users)
            db.commit()
    finally:
        db.close()
```

- [ ] **Step 4: Create tests/__init__.py**

Empty file.

- [ ] **Step 5: Verify models load correctly**

Run: `cd /home/mac/25gitlab/data_viewer && python -c "from backend.models import *; from backend.db import init_db; print('OK')"`

- [ ] **Step 6: Commit**

```bash
git add backend/db.py backend/models.py backend/seed.py tests/ && git commit -m "feat: add database layer with ORM models and seed data"
```

---

## Task 3: Auth System (Backend)

**Files:**
- Create: `backend/auth.py`
- Create: `backend/api/auth.py`
- Create: `backend/main.py`
- Create: `tests/conftest.py`
- Create: `tests/test_auth.py`

- [ ] **Step 0: Create backend/main.py and tests/conftest.py first**

Create `backend/main.py` (FastAPI app with CORS middleware, lifespan for init_db + seed_users) and `tests/conftest.py` (fixtures for test DB, test client, auth_headers) since conftest imports from `backend.main`. The conftest should use temp SQLite DB, override `get_db`, and provide `auth_headers` fixture that seeds a test user and logs in to get a JWT token. Semantic chunking tests should **mock** the embedding service (use `unittest.mock.patch` on `backend.services.embedding.get_embedding_sync`).

- [ ] **Step 1: Write failing tests for auth**

`tests/test_auth.py`: Test login success, login wrong password, GET /me with valid token, GET /me without token (401).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/mac/25gitlab/data_viewer && python -m pytest tests/test_auth.py -v`

- [ ] **Step 3: Implement backend/auth.py**

JWT encode/decode using PyJWT. `get_current_user` FastAPI dependency that extracts user from Bearer token. Password verify with passlib bcrypt.

- [ ] **Step 4: Implement backend/api/auth.py**

FastAPI router with:
- `POST /api/auth/login` — verify credentials, return `{token, user: {id, username, display_name}}`
- `POST /api/auth/logout` — return `{ok: true}` (client clears token)
- `GET /api/auth/me` — return current user info (requires auth)

- [ ] **Step 5: Create backend/main.py**

FastAPI app with CORS middleware, include auth router, lifespan that calls `init_db()` and `seed_users()`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/mac/25gitlab/data_viewer && python -m pytest tests/test_auth.py -v`

- [ ] **Step 7: Manual smoke test**

Run: `cd /home/mac/25gitlab/data_viewer && uvicorn backend.main:app --port 8080 &`
Then: `curl -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}'`
Expected: JSON with token

- [ ] **Step 8: Commit**

```bash
git add backend/auth.py backend/api/auth.py backend/main.py tests/test_auth.py && git commit -m "feat: add JWT auth system with login/logout/me endpoints"
```

---

## Task 4: Document Loading & File Serving (Backend)

**Files:**
- Create: `backend/api/documents.py`
- Create: `backend/api/files.py`
- Create: `backend/services/pdf_thumbnails.py`
- Create: `backend/services/markdown_parser.py`
- Create: `tests/test_documents.py`
- Create: `tests/test_markdown_parser.py`

- [ ] **Step 1: Write failing tests**

`tests/test_documents.py`:
- Test POST /api/documents/load with valid folder path → 200, returns document
- Test POST /api/documents/load with invalid path → 400
- Test POST /api/documents/load with duplicate path → returns existing
- Test GET /api/documents → list
- Test GET /api/documents/{id} → detail with metadata
- Test GET /api/documents/{id}/markdown → markdown content
- Test GET /api/documents/{id}/images/{name} → image file

Use the example data at `/home/mac/25gitlab/deepseek-ocr-api/examples/output/` for tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_documents.py -v`

- [ ] **Step 3: Implement backend/services/pdf_thumbnails.py**

```python
import fitz  # PyMuPDF
from pathlib import Path
from backend.config import settings

def generate_thumbnails(pdf_path: str, document_id: int) -> Path:
    """Generate JPEG thumbnails for each page of the PDF. Returns thumbnail directory."""
    thumb_dir = Path(settings.thumbnail_dir) / str(document_id)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))  # 50% scale for thumbnails
        thumb_path = thumb_dir / f"page_{page_num + 1}.jpg"
        if not thumb_path.exists():
            pix.save(str(thumb_path))
    doc.close()
    return thumb_dir

def get_thumbnail_path(document_id: int, page_num: int) -> Path:
    return Path(settings.thumbnail_dir) / str(document_id) / f"page_{page_num}.jpg"
```

- [ ] **Step 4: Implement backend/services/markdown_parser.py**

Parse the `.mmd` file:
- `extract_text_only(markdown: str) -> list[str]` — strip images, tables, return text paragraphs
- `extract_tables(markdown: str) -> list[dict]` — extract markdown tables with surrounding descriptions
- `extract_images_with_captions(markdown: str) -> list[dict]` — extract `![](images/X_Y.jpg)` with their italic captions
- `extract_image_refs_from_chunk(content: str) -> list[str]` — find all `images/X_Y.jpg` references in a chunk

- [ ] **Step 5: Implement backend/api/documents.py**

FastAPI router:
- `POST /api/documents/load` — validate folder, read metadata.json, create Document record, generate thumbnails
- `GET /api/documents` — list all documents
- `GET /api/documents/{id}` — document detail with metadata.json and parsing_metrics.json content

- [ ] **Step 6: Implement backend/api/files.py**

FastAPI router:
- `GET /api/documents/{id}/markdown` — read and return `.mmd` file content
- `GET /api/documents/{id}/images/{name}` — serve image from `images/` subfolder as FileResponse
- `GET /api/documents/{id}/layout-pdf` — serve `_layouts.pdf` as FileResponse
- `GET /api/documents/{id}/page/{num}/thumbnail` — serve cached thumbnail JPEG

- [ ] **Step 7: Implement backend/api/views.py**

FastAPI router:
- `GET /api/documents/{id}/text-only` — uses markdown_parser.extract_text_only
- `GET /api/documents/{id}/tables-only` — uses markdown_parser.extract_tables
- `GET /api/documents/{id}/images-only` — uses markdown_parser.extract_images_with_captions

- [ ] **Step 7b: Write tests/test_markdown_parser.py**

Unit tests for markdown_parser:
- Test extract_text_only strips images/tables
- Test extract_tables returns table content with descriptions
- Test extract_images_with_captions returns image refs with italic captions
- Test extract_image_refs_from_chunk finds all `![](images/...)` patterns

- [ ] **Step 8: Register routers in main.py**

Add documents, files, views routers to the FastAPI app.

- [ ] **Step 9: Run tests**

Run: `python -m pytest tests/test_documents.py -v`

- [ ] **Step 10: Commit**

```bash
git add backend/api/documents.py backend/api/files.py backend/api/views.py backend/services/ tests/test_documents.py && git commit -m "feat: add document loading, file serving, and view endpoints"
```

---

## Task 5: Chunking Service (Backend)

**Files:**
- Create: `backend/services/chunking.py`
- Create: `backend/services/embedding.py`
- Create: `tests/test_chunking_service.py`

- [ ] **Step 1: Write failing tests for chunking service**

`tests/test_chunking_service.py`:
- Test character chunking with known input → expected number of chunks
- Test recursive chunking with Japanese text → respects separators
- Test markdown chunking → splits on headers, preserves hierarchy
- Test page-wise chunking → one chunk per `---` delimiter
- Test page_number assignment for each strategy
- Test image reference extraction per chunk
- Test semantic chunking with **mocked** embedding service (use `unittest.mock.patch` on `backend.services.embedding.get_embedding_sync` returning dummy vectors)

Use inline test fixtures with representative markdown content (copied from the example data). **Prerequisite:** Example data at `/home/mac/25gitlab/deepseek-ocr-api/examples/output/` can be used for reference but tests should not depend on it at runtime.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_chunking_service.py -v`

- [ ] **Step 3: Implement backend/services/embedding.py**

```python
import httpx
from backend.config import settings

async def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Call BGE-M3 endpoint. Returns list of embedding vectors."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.embedding_endpoint}/v1/embeddings",
            json={"input": texts, "model": settings.embedding_model},
            headers={"Authorization": f"Bearer {settings.embedding_api_key}"}
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]

def get_embedding_sync(text: str) -> list[float]:
    """Synchronous single-text embedding for use in chunking."""
    import httpx
    response = httpx.post(
        f"{settings.embedding_endpoint}/v1/embeddings",
        json={"input": [text], "model": settings.embedding_model},
        headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
        timeout=60.0
    )
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]
```

- [ ] **Step 4: Implement backend/services/chunking.py**

Implement all 5 strategies. Adapt logic from `/home/mac/25gitlab/rag_anything/bulk_module/page_aware_chunker_deepseek.py`:

```python
from enum import Enum
from typing import List, Dict, Optional, Callable
from langchain_text_splitters import (
    CharacterTextSplitter,
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
import re

class ChunkingStrategy(Enum):
    CHARACTER = "character"
    RECURSIVE = "recursive"
    SEMANTIC = "semantic"
    MARKDOWN = "markdown"
    PAGE = "page"

def chunk_document(
    markdown_content: str,
    strategy: str,
    chunk_size: int = 2000,
    chunk_overlap: int = 200,
    similarity_threshold: float = 0.5,
    min_chunk_size: int = 100,
    embedding_fn: Optional[Callable] = None,
    metadata_images: Optional[list] = None,
) -> List[Dict]:
    """Main entry point. Returns list of chunk dicts with content, chunk_index, page_number, image_refs."""
    ...
```

Key functions:
- `_split_into_pages(markdown)` — split on `---` delimiters, return list of `(page_num, text)`
- `_determine_page_number(chunk_text, pages)` — find which page owns the majority of chunk content
- `_extract_image_refs(content)` — regex for `![](images/X_Y.jpg)`
- `_chunk_character(text, size, overlap)` — CharacterTextSplitter
- `_chunk_recursive(text, size, overlap)` — RecursiveCharacterTextSplitter with JP separators
- `_chunk_semantic(text, size, threshold, min_size, embed_fn)` — embedding-based grouping
- `_chunk_markdown(text, size, overlap)` — MarkdownHeaderTextSplitter + recursive fallback
- `_chunk_page(markdown)` — one chunk per page

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_chunking_service.py -v`

- [ ] **Step 6: Commit**

```bash
git add backend/services/chunking.py backend/services/embedding.py tests/test_chunking_service.py && git commit -m "feat: implement 5 chunking strategies with page tracking"
```

---

## Task 6: Chunk API Endpoints (Backend)

**Files:**
- Create: `backend/api/chunks.py`
- Create: `tests/test_chunks.py`

- [ ] **Step 1: Write failing tests**

`tests/test_chunks.py`:
- Test POST /api/documents/{id}/chunk with "recursive" strategy → creates chunks
- Test GET /api/documents/{id}/chunks → returns paginated chunks
- Test GET /api/documents/{id}/chunks?search=Adobe → filters by keyword
- Test PUT /api/chunks/{id}/edit → creates chunk_edit, returns modified
- Test GET /api/chunks/{id}/diff → returns original + modified
- Test DELETE /api/chunks/{id}/edit → reverts to original
- Test re-chunking deletes old chunks (and their edits/feedback via CASCADE)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_chunks.py -v`

- [ ] **Step 3: Implement backend/api/chunks.py**

FastAPI router with all chunk endpoints per spec:
- `POST /api/documents/{id}/chunk` — run chunking service, store chunks + chunk_images, return chunks. For semantic strategy, use background task + in-memory task dict.
- `GET /api/documents/{id}/chunks` — paginated list with search. Search uses `COALESCE(chunk_edits.modified_content, chunks.content) LIKE %keyword%`. Returns `{chunks, total, page, per_page}`.
- `GET /api/documents/{id}/chunks/{chunk_id}` — single chunk with edit/feedback info
- `PUT /api/chunks/{id}/edit` — upsert chunk_edit
- `GET /api/chunks/{id}/diff` — return original + modified
- `DELETE /api/chunks/{id}/edit` — delete chunk_edit record
- `GET /api/documents/{id}/chunk-status` — SSE endpoint using sse-starlette

- [ ] **Step 4: Register chunk router in main.py**

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_chunks.py -v`

- [ ] **Step 6: Commit**

```bash
git add backend/api/chunks.py tests/test_chunks.py && git commit -m "feat: add chunk API endpoints with search, edit, diff, and SSE status"
```

---

## Task 7: Feedback API Endpoints (Backend)

**Files:**
- Create: `backend/api/feedback.py`
- Create: `tests/test_feedback.py`

- [ ] **Step 1: Write failing tests**

`tests/test_feedback.py`:
- Test PUT /api/chunks/{id}/feedback with emoji_type="correct" → 200
- Test GET /api/chunks/{id}/feedback → returns emoji + comment
- Test PUT /api/chunks/{id}/feedback again (upsert) → updates
- Test invalid emoji_type → 422

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement backend/api/feedback.py**

FastAPI router:
- `PUT /api/chunks/{id}/feedback` — upsert into chunk_feedback
- `GET /api/chunks/{id}/feedback` — return feedback for current user

- [ ] **Step 4: Register feedback router in main.py**

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_feedback.py -v`

- [ ] **Step 6: Commit**

```bash
git add backend/api/feedback.py tests/test_feedback.py && git commit -m "feat: add feedback API endpoints with emoji upsert"
```

---

## Task 8: Frontend — Global Styles, Stores & API Client

> **Use the frontend-design skill for this and all subsequent frontend tasks.**

**Files:**
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/documents.ts`
- Create: `frontend/src/api/chunks.ts`
- Create: `frontend/src/api/feedback.ts`
- Create: `frontend/src/stores/authStore.ts`
- Create: `frontend/src/stores/documentStore.ts`
- Create: `frontend/src/stores/chunkStore.ts`

- [ ] **Step 1: Create global.css**

CSS variables for the Data Viewer theme:
- `--color-primary: #e63946` (red from logo)
- `--color-primary-dark: #c1121f`
- `--color-bg: #f8f9fa`
- `--color-surface: #ffffff`
- `--color-text: #2b2d42`
- `--color-text-secondary: #6c757d`
- `--color-border: #dee2e6`
- `--color-highlight: #fff3cd`
- `--transition-fast: 100ms ease`
- `--transition-normal: 200ms ease`
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`

Global reset, font (system sans-serif with Japanese support), scrollbar styling.

- [ ] **Step 2: Create API client with JWT interceptor**

`frontend/src/api/client.ts`: Axios instance that reads token from localStorage and adds Bearer header. 401 interceptor redirects to login.

- [ ] **Step 3: Create API modules**

- `auth.ts`: login, logout, getMe
- `documents.ts`: loadFolder, listDocuments, getDocument, getMarkdown, getTextOnly, getTablesOnly, getImagesOnly
- `chunks.ts`: triggerChunking, getChunks (with search/pagination), getChunk, editChunk, getDiff, deleteEdit, subscribeChunkStatus (SSE)
- `feedback.ts`: setFeedback, getFeedback

- [ ] **Step 4: Create Zustand stores**

- `authStore.ts`: `{user, token, isAuthenticated, login, logout, checkAuth}`
- `documentStore.ts`: `{documents, selectedDocument, viewMode, setDocument, setViewMode, loadDocuments}`
- `chunkStore.ts`: `{chunks, selectedChunk, searchQuery, page, totalPages, chunkingStrategy, isChunking, setChunk, setSearch, setPage, triggerChunking}`

- [ ] **Step 5: Update main.tsx and App.tsx**

Import global.css, set up BrowserRouter, render App.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add -A && cd .. && git commit -m "feat: add frontend stores, API client, and global styles"
```

---

## Task 9: Frontend — Login Page

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/LoginPage.tsx`

- [ ] **Step 1: Build LoginPage component**

Design requirements:
- Centered card on a clean background
- Company logo (served from `/documentation/logo.png`) prominently displayed
- Data Viewer text below logo
- Username and password fields with Japanese labels
- Red login button matching `--color-primary`
- Error message display with shake animation on failed login
- Full-page fade-in animation (framer-motion `AnimatePresence`)
- Fluid transition to main app on successful login

- [ ] **Step 2: Wire up to authStore**

On submit: call `authStore.login(username, password)`. On success: navigate to `/`. On error: show error with animation.

- [ ] **Step 3: Add auth gate in App.tsx**

If not authenticated, show LoginPage. If authenticated, show main layout. Use `AnimatePresence` for crossfade.

- [ ] **Step 4: Test manually**

Run both servers. Navigate to app. Login form should appear. Login with admin/admin. Should transition to empty main layout.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ && git commit -m "feat: add login page with animation and auth gate"
```

---

## Task 10: Frontend — Header Component

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/Header.tsx`

- [ ] **Step 1: Build Header component**

Design requirements (matching wireframe):
- Left: current date/time in Japanese format (`2026/03/25 (火) 14:00`), updated every minute
- Center-left: home icon (clickable, navigates to root)
- Center: company logo image + Data Viewer bold text
- Right: Login/user display button (red), user avatar icon
- Bottom border: 2px solid `--color-primary`
- All hover states with 100ms transitions
- Height: ~48px, compact

- [ ] **Step 2: Integrate into App.tsx layout**

Header at top, full width.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header.tsx && git commit -m "feat: add header with logo, date/time, and user info"
```

---

## Task 11: Frontend — Sidebar Component

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/FolderLoadDialog.tsx`

- [ ] **Step 1: Build Sidebar component**

Design requirements:
- Width: 180px fixed, left side
- Search input at top (filters file list)
- File tree: document names with file icon, click to select (highlighted background)
- "Load Folder" button at top of tree (opens FolderLoadDialog)
- View switcher at bottom: Markdown / Text Only / Tables Only / Images Only (radio-style buttons)
- Expand/collapse animation for file tree items (framer-motion)
- Smooth highlight transition on file selection

- [ ] **Step 2: Build FolderLoadDialog component**

Modal dialog with:
- Text input for folder path
- Validate button that calls POST /api/documents/load
- Loading spinner while loading
- Error display if path invalid
- Success closes dialog and adds to file tree

- [ ] **Step 3: Wire up to documentStore**

Sidebar reads from `documentStore.documents`, sets `documentStore.selectedDocument` on click.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/FolderLoadDialog.tsx && git commit -m "feat: add sidebar with file tree, search, view switcher, and folder load dialog"
```

---

## Task 12: Frontend — Main Layout Shell

> **Use the frontend-design skill.**

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Build main layout**

After login, the app shows:
- Header (top, full width)
- Sidebar (left, 180px)
- Main content area (flex: 1, contains ThumbnailPanel + ChunkTable + ViewerEditor)
- Footer (bottom, full width)

Use CSS Grid or flexbox. Content area has vertical flex layout:
1. ThumbnailPanel (top, ~200px)
2. ChunkTable (middle, flex: 1, scrollable)
3. ViewerEditor (bottom, collapsible, ~120px default)

- [ ] **Step 2: Add view mode routing**

Based on `documentStore.viewMode`:
- `"chunks"` (default) → ThumbnailPanel + ChunkTable + ViewerEditor
- `"markdown"` → MarkdownView
- `"text"` → TextOnlyView
- `"tables"` → TablesOnlyView
- `"images"` → ImagesOnlyView

Use framer-motion `AnimatePresence` with crossfade for view transitions (200ms).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx && git commit -m "feat: add main layout shell with view mode switching"
```

---

## Task 13: Frontend — Chunk Table

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/ChunkTable.tsx`

- [ ] **Step 1: Build ChunkTable component**

Design requirements (matching wireframe closely):
- Table header row with columns: Chunk No | Chunk Text | Modified | FB | FB Comment
- **Chunking strategy dropdown** in the Chunk Text header: `<select>` with options: Character, Recursive, Semantic, Markdown, Page-wise. Selecting triggers `chunkStore.triggerChunking(strategy)`.
- Confirmation dialog before re-chunking (warns about losing edits/feedback)
- Chunk rows: click to select (loads in ViewerEditor)
  - Selected row: light blue background with subtle shadow lift (150ms ease transition)
  - Hover: slightly darker background (100ms transition)
- Chunk text: truncated with ellipsis (max 2 lines)
- Modified column: red dot if edited
- FB column: shows current emoji
- FB Comment column: truncated text
- **Pagination** at bottom: `1, 2, ... <previous | 15 | next> 16, 17 ... 32`
- Loading skeleton shimmer animation when chunking is in progress
- Fade-slide animation for rows appearing after chunking/pagination

- [ ] **Step 2: Wire up to chunkStore**

Read chunks, pagination, search from store. On row click, set `chunkStore.selectedChunk`.

- [ ] **Step 3: Add chunk search bar**

Search input above the table (right-aligned). On input change (debounced 300ms), update `chunkStore.searchQuery` which triggers re-fetch with `?search=keyword`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChunkTable.tsx && git commit -m "feat: add chunk table with chunking dropdown, pagination, and row selection"
```

---

## Task 14: Frontend — Viewer/Editor Panel

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/ViewerEditor.tsx`

- [ ] **Step 1: Build ViewerEditor component**

Design requirements:
- Collapsible panel at bottom with "Viewer and Editor" header bar
- Click header to expand/collapse (framer-motion layout animation, spring physics)
- Editable textarea showing selected chunk content
- **Keyword highlights:** if `chunkStore.searchQuery` is set, highlight matching text with `--color-highlight` background. Highlights fade in (150ms).
- **Save button** (red, bottom-right): calls PUT /api/chunks/{id}/edit. On save, chunk table updates modified indicator.
- **Mode switching:** When editing FB comment, panel shows comment input instead of chunk text. Switch with smooth crossfade.
- Text area auto-resizes to content

- [ ] **Step 2: Wire up to chunkStore**

Read `chunkStore.selectedChunk`. On save, call API then refresh chunk data.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ViewerEditor.tsx && git commit -m "feat: add collapsible viewer/editor panel with save and keyword highlighting"
```

---

## Task 15: Frontend — Thumbnail Panel

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/ThumbnailPanel.tsx`

- [ ] **Step 1: Build ThumbnailPanel component**

Design requirements (matching wireframe):
- Left: Large page thumbnail (~200x140px) from layout PDF. Shows current page based on selected chunk's page_number. **Crossfade transition** when page changes.
- Center: Layout PDF mini-thumbnails column (80x60px each). Clickable to open PdfViewer modal.
- Right: Chunk image thumbnails grid. Shows all images from the selected chunk. Each thumbnail ~90x70px.
  - Click any image to enlarge in ImageModal
  - Selected image gets red border (`--color-primary`)
  - All images visible at once (no carousel)
- **Thumbnail updates on scroll:** As user scrolls ChunkTable, observe which chunk rows are visible. Update page thumbnail based on topmost visible chunk's page_number.

- [ ] **Step 2: Wire up to stores**

Read selected chunk from chunkStore, document from documentStore. Fetch images via `/api/documents/{id}/images/{name}`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ThumbnailPanel.tsx && git commit -m "feat: add thumbnail panel with page, layout PDF, and chunk image thumbnails"
```

---

## Task 16: Frontend — Image Modal with Zoom

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/ImageModal.tsx`

- [ ] **Step 1: Build ImageModal component**

Design requirements:
- Full-screen dark overlay (backdrop blur-in animation, 250ms)
- Image scales from thumbnail to full size (framer-motion layoutId or scale spring)
- **Mouse wheel zoom:** Smooth CSS transform scale (0.5x to 5x range)
- **Click-and-drag pan:** When zoomed > 1x, dragging moves the image. CSS transform translate.
- **Close:** Escape key, click outside image, or X button in corner
- **Dismiss animation:** Scale down + fade out (250ms spring)
- Show image filename and page info below the image

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ImageModal.tsx && git commit -m "feat: add image modal with zoom, pan, and spring animations"
```

---

## Task 17: Frontend — Feedback Picker & Diff View

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/FeedbackPicker.tsx`
- Create: `frontend/src/components/DiffView.tsx`

- [ ] **Step 1: Build FeedbackPicker component**

Design requirements:
- Popover that appears when clicking FB cell in chunk table
- 5 emoji options in a horizontal row: ✅ ❌ ✏️ ❓ ⚠️
- Each emoji has a tooltip label on hover
- Click to select → pop-in scale animation (200ms spring)
- Selected emoji highlighted with colored background
- Popover appears with fade-in + slight Y offset animation
- Calls PUT /api/chunks/{id}/feedback on selection

- [ ] **Step 2: Build DiffView component**

Design requirements:
- Modal or panel showing side-by-side diff
- Uses react-diff-viewer-continued library
- Left side: original (red deletions), Right side: modified (green additions)
- **Revert button** at bottom: calls DELETE /api/chunks/{id}/edit, then refreshes
- Opens when clicking the red dot in Modified column

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FeedbackPicker.tsx frontend/src/components/DiffView.tsx && git commit -m "feat: add feedback emoji picker and diff view with revert"
```

---

## Task 18: Frontend — Content Views (Markdown, Text, Tables, Images)

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/MarkdownView.tsx`
- Create: `frontend/src/components/TextOnlyView.tsx`
- Create: `frontend/src/components/TablesOnlyView.tsx`
- Create: `frontend/src/components/ImagesOnlyView.tsx`

- [ ] **Step 1: Build MarkdownView**

Full markdown rendering using react-markdown + remark-gfm. Images rendered inline with click-to-enlarge (reuse ImageModal). Scrollable.

- [ ] **Step 2: Build TextOnlyView**

Fetches from `/api/documents/{id}/text-only`. Displays text paragraphs in a clean readable layout. No images or tables.

- [ ] **Step 3: Build TablesOnlyView**

Fetches from `/api/documents/{id}/tables-only`. Renders each table in a styled card with the generated description below it.

- [ ] **Step 4: Build ImagesOnlyView**

Fetches from `/api/documents/{id}/images-only`. Grid of images with their AI-generated captions. Click to enlarge via ImageModal.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MarkdownView.tsx frontend/src/components/TextOnlyView.tsx frontend/src/components/TablesOnlyView.tsx frontend/src/components/ImagesOnlyView.tsx && git commit -m "feat: add markdown, text-only, tables-only, and images-only views"
```

---

## Task 19: Frontend — PDF Viewer

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/PdfViewer.tsx`

- [ ] **Step 1: Build PdfViewer component**

Design requirements:
- Modal overlay (like ImageModal style)
- Uses pdfjs-dist to render PDF pages on canvas
- Page navigation: prev/next buttons + page number input
- Zoom controls: +/- buttons + fit-to-width
- Loads from `/api/documents/{id}/layout-pdf`
- Smooth page transition animations

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PdfViewer.tsx && git commit -m "feat: add PDF viewer modal with page navigation and zoom"
```

---

## Task 20: Frontend — Footer Component

> **Use the frontend-design skill.**

**Files:**
- Create: `frontend/src/components/Footer.tsx`

- [ ] **Step 1: Build Footer component**

Design requirements:
- Thin bar at bottom (28px height)
- Left: green dot + user ID + display name
- Left: settings gear icon, user avatar icon
- Subtle top border
- 100ms hover transitions on icons

- [ ] **Step 2: Add to App.tsx layout**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Footer.tsx && git commit -m "feat: add footer with user status and settings"
```

---

## Task 21: Production Build & Static Serving

**Files:**
- Modify: `backend/main.py`
- Create: `start.sh`

- [ ] **Step 1: Add static file serving to main.py**

After all API routes, mount the frontend dist directory:
```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
```

- [ ] **Step 2: Create start.sh**

```bash
#!/bin/bash
cd "$(dirname "$0")"

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "Building frontend..."
    cd frontend && npm run build && cd ..
fi

# Copy logo to frontend public
cp documentation/logo.png frontend/dist/logo.png 2>/dev/null || true

# Start server
echo "Starting Data Viewer on port ${PORT:-8080}..."
python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
```

- [ ] **Step 3: Test production build**

```bash
cd frontend && npm run build && cd ..
PORT=8080 bash start.sh
```

Open `http://app-host:8080` and verify full app works.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py start.sh && git commit -m "feat: add production build serving and start script"
```

---

## Task 22: Integration Testing & Polish

**Files:**
- All existing files (bug fixes)

- [ ] **Step 1: End-to-end smoke test**

Start the full application. Verify each flow:
1. Login as admin
2. Load the example folder
3. Select the document in sidebar
4. See markdown view
5. Switch to chunks view
6. Select "Recursive" chunking → chunks appear
7. Click a chunk → loads in editor
8. Edit and save → modified indicator appears
9. Click modified → diff view shows
10. Set feedback emoji + comment
11. Search for "Adobe" → highlights in editor
12. Click image thumbnail → modal with zoom
13. Click layout PDF thumbnail → PDF viewer
14. Switch to text-only, tables-only, images-only views
15. Pagination navigation

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Run all backend tests**

Run: `python -m pytest tests/ -v`

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "fix: integration testing fixes and polish"
```
