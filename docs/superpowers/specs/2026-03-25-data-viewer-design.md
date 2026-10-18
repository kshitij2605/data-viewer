# Data Viewer — Design Specification

A GUI visualizer for document parsing output (from deepseek-ocr-api), built for an internal team.

## Overview

The application loads folders of processed document data (markdown, images, layout PDFs, metadata) and provides an interactive interface for viewing, chunking, editing, and giving feedback on extracted content. Deployed on `app-host`.

## Tech Stack

- **Backend:** Python FastAPI, SQLite (via SQLAlchemy), PyMuPDF (PDF thumbnails)
- **Frontend:** React 18 + TypeScript, Vite, framer-motion (animations)
- **Key libraries:** react-markdown, pdf.js, framer-motion, react-diff-viewer (diff view), zustand (state management)
- **Embedding service:** BGE-M3 at `http://embedding-host:8000` (credentials via env vars)

## Architecture

Monolith: single FastAPI server serves both the REST API and the built React static files.

```
data_viewer/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Settings (DB path, embedding endpoint, etc.)
│   ├── db.py                   # SQLite setup, engine, session
│   ├── models.py               # SQLAlchemy ORM models
│   ├── api/
│   │   ├── auth.py             # Login/logout/me endpoints
│   │   ├── documents.py        # Document loading, listing, detail
│   │   ├── chunks.py           # Chunking, chunk CRUD, search
│   │   ├── feedback.py         # Feedback emoji + comment endpoints
│   │   └── files.py            # Static file serving (images, PDFs, thumbnails)
│   └── services/
│       ├── chunking.py         # 5 chunking strategies
│       ├── embedding.py        # BGE-M3 client
│       ├── markdown_parser.py  # Extract text/tables/images from markdown
│       └── pdf_thumbnails.py   # Generate page thumbnails from layout PDF
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/                # API client functions
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ChunkTable.tsx
│   │   │   ├── ViewerEditor.tsx
│   │   │   ├── ThumbnailPanel.tsx
│   │   │   ├── ImageModal.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── MarkdownView.tsx
│   │   │   ├── TextOnlyView.tsx
│   │   │   ├── TablesOnlyView.tsx
│   │   │   ├── ImagesOnlyView.tsx
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── DiffView.tsx
│   │   │   ├── FeedbackPicker.tsx
│   │   │   └── FolderLoadDialog.tsx
│   │   ├── stores/             # Zustand state management
│   │   └── styles/
│   └── vite.config.ts
├── data/                       # SQLite DB file (auto-created)
└── documentation/
    ├── logo.png
    └── image.png               # Wireframe reference
```

## Database Schema (SQLite)

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_name TEXT NOT NULL,
    folder_path TEXT UNIQUE NOT NULL,
    pdf_title TEXT,
    num_pages INTEGER DEFAULT 0,
    num_images INTEGER DEFAULT 0,
    num_tables INTEGER DEFAULT 0,
    loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    loaded_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    chunking_strategy TEXT NOT NULL,
    chunk_size_setting INTEGER DEFAULT 2000,
    chunk_overlap_setting INTEGER DEFAULT 200,
    similarity_threshold REAL,
    min_chunk_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chunk_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    original_content TEXT NOT NULL,
    modified_content TEXT NOT NULL,
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chunk_id, user_id)
);

CREATE TABLE chunk_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    emoji_type TEXT CHECK(emoji_type IN ('correct','incorrect','needs_edit','unclear','partial')),
    comment TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chunk_id, user_id)
);

CREATE TABLE chunk_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    image_name TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    category TEXT,
    bbox_json TEXT
);
```

Pre-seeded users: `admin/admin` (Admin User), `reviewer1/reviewer1` (Reviewer 1), `reviewer2/reviewer2` (Reviewer 2).

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with username/password, returns JWT token |
| POST | `/api/auth/logout` | Clear client-side token (JWT is stateless; no server-side blacklist needed for this scale) |
| GET | `/api/auth/me` | Current user info |

### Documents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents/load` | Load a folder path into the DB. Body: `{folder_path}`. Validates path exists and contains expected files. If already loaded (UNIQUE on folder_path), returns existing document. UI provides a text input dialog (FolderLoadDialog) for the path. Path is validated server-side (must be absolute, must contain metadata.json). |
| GET | `/api/documents` | List all loaded documents |
| GET | `/api/documents/{id}` | Document detail with metadata |

### Chunks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents/{id}/chunk` | Trigger chunking. Body: `{strategy, chunk_size, chunk_overlap, similarity_threshold?, min_chunk_size?}` (params vary by strategy). Replaces existing chunks (CASCADE deletes edits/feedback — UI shows confirmation dialog before re-chunking). Uses FastAPI `BackgroundTasks` for semantic strategy; returns task ID, client polls for completion via SSE. |
| GET | `/api/documents/{id}/chunks` | List chunks. Query params: `?search=keyword&page=1&per_page=15` |
| GET | `/api/documents/{id}/chunks/{chunk_id}` | Single chunk detail |
| PUT | `/api/chunks/{id}/edit` | Save edited content (upsert — repeated saves overwrite existing edit). Body: `{modified_content}`. Stores original + modified for diff. `chunks.content` is NOT updated — the canonical text for display is `chunk_edits.modified_content` when it exists, otherwise `chunks.content`. Search queries check both. |
| GET | `/api/chunks/{id}/diff` | Returns `{original, modified}` for diff view |
| DELETE | `/api/chunks/{id}/edit` | Revert to original — deletes the chunk_edit record, restoring `chunks.content` as canonical |
| GET | `/api/documents/{id}/chunk-status` | SSE endpoint for chunking progress. Returns events: `{status: "processing"|"complete"|"error", progress?: number, total?: number}`. Used when semantic chunking runs as a background task. |

### Feedback
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/chunks/{id}/feedback` | Set emoji + comment. Body: `{emoji_type, comment}` |
| GET | `/api/chunks/{id}/feedback` | Get feedback for chunk |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents/{id}/markdown` | Raw markdown content |
| GET | `/api/documents/{id}/images/{name}` | Serve image file (e.g., `1_0.jpg`) |
| GET | `/api/documents/{id}/layout-pdf` | Serve the `_layouts.pdf` file |
| GET | `/api/documents/{id}/page/{num}/thumbnail` | Page thumbnail (generated from layout PDF, cached) |

### Views
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents/{id}/text-only` | Text blocks extracted from markdown (no images/tables) |
| GET | `/api/documents/{id}/tables-only` | Tables with their generated descriptions |
| GET | `/api/documents/{id}/images-only` | Images with their AI-generated captions |

## Input Data Format

Each processed document subfolder contains:
- `*_with_captions.mmd` — Markdown with image references and AI-generated captions (italicized)
- `*_layouts.pdf` — Original PDF with detected layout boxes superimposed
- `metadata.json` — Document metadata (title, pages, image list with page indices, bboxes, categories)
- `parsing_metrics.json` — Processing timing and statistics
- `images/` — Extracted images named `{page}_{order}.jpg`

Image naming: `{page_index}_{order_within_page}.jpg` (e.g., `3_0.jpg` = page 3, first image).

Pages in the markdown are separated by `---` (horizontal rule).

Image captions in the markdown follow the pattern:
```markdown
![](images/X_Y.jpg)

*Caption text in italics describing the image.*
```

## Chunking Strategies

Five strategies available, adapted from the `rag_anything` codebase:

### 1. Character
Simple splitting at paragraph boundaries (`\n\n`). Fixed chunk size with configurable overlap.

**Params:** chunk_size (default 2000), chunk_overlap (default 200)

### 2. Recursive (recommended)
Hierarchical splitting with cascading separators optimized for Japanese and English text. Tries paragraph breaks first, then line breaks, then Japanese/English sentence boundaries, down to character level.

**Separator priority:** `\n\n` → `\n` → `。\n` → `。` → `．` → `. ` → `！` → `？` → `、` → `，` → `, ` → ` ` → `""`

**Params:** chunk_size (default 2000), chunk_overlap (default 200)

### 3. Semantic
Embedding-based grouping. Splits text into sentences, generates embeddings via BGE-M3, groups sentences by cosine similarity. Creates a new chunk when similarity drops below threshold or size limit is reached.

**Params:** chunk_size (default 2000), similarity_threshold (default 0.5), min_chunk_size (default 100)

**Embedding endpoint:** `http://embedding-host:8000` (model: BAAI/bge-m3, api-key: REDACTED)

### 4. Markdown
Header-aware splitting on H1/H2/H3 boundaries. Preserves header hierarchy by prepending parent headers to sub-chunks. Long sections are further split using recursive strategy. Continuation chunks marked with context breadcrumbs (e.g., `[続き: Title > Section]`).

**Params:** chunk_size (default 2000), chunk_overlap (default 200)

### 5. Page-wise
Splits on `---` page delimiters. Each page becomes one chunk. No further splitting.

**Params:** None (deterministic based on page boundaries)

### Chunk Output Format
Each chunk stored with:
- `content` — the chunk text
- `chunk_index` — sequential number
- `page_number` — associated page (1-indexed). For non-page-wise strategies: determined by which `---` page boundary the chunk's first character falls within. If a chunk spans pages, it gets the page number of the majority of its content.
- `chunking_strategy` — which strategy created it
- Associated images via `chunk_images` table (parsed from `![](images/...)` references in content)

## UI Layout

### Header
- Current date/time in Japanese format (e.g., `2026/03/25 (火) 14:00`)
- Home navigation icon
- Company logo (from `documentation/logo.png`) + Data Viewer text
- Login button (red, `#e63946`) / logged-in user display
- User avatar icon

### Left Sidebar (180px)
- **Search bar** — filters file tree by keyword
- **File tree** — lists loaded documents, click to select
- **View switcher** — Markdown / Text Only / Tables Only / Images Only

### Center Top — Thumbnail Panel
- **Page thumbnail (large)** — current page from layout PDF, updates as user scrolls through chunks
- **Layout PDF mini-thumbnails** — small previews of layout PDF pages, clickable to open full PDF viewer
- **Chunk image thumbnails** — images associated with the currently selected chunk, displayed in a grid. All visible at once. Click any to enlarge in a modal with zoom.
- **Chunk search bar** (right-aligned) — keyword search, filters chunks and highlights matches

### Center — Chunk Table
- **Columns:** Chunk No | Chunk Text (with chunking strategy dropdown) | Modified | FB | FB Comment
- **Chunking dropdown** in the header: selecting a strategy triggers automatic chunking
- **Chunk text** column shows truncated content; clicking a row loads it in the editor below
- **Modified** column: red dot indicator if chunk has been edited, click to see diff
- **FB** column: emoji display (✅ ❌ ✏️ ❓ ⚠️), clickable to set/change
- **FB Comment** column: truncated comment text, clickable to edit in the viewer
- **Pagination:** `1, 2, ... <previous | 15 | next> 16, 17 ... 32` style, 15 chunks per page

### Bottom — Viewer/Editor Panel
- Collapsible panel with header "Viewer and Editor"
- Editable text area showing the selected chunk's content
- Keyword search highlights visible in the editor
- **Save** button (red) — saves edit, stores original + modified, marks chunk as modified in table
- When editing FB comment: panel switches to comment editing mode

### Footer
- Online status indicator (green dot)
- User ID + display name
- Settings gear icon

## UX — Fluid Motion & Animations

Core UX requirement: all interactions must feel smooth and responsive. Implementation via `framer-motion` and CSS transitions.

| Interaction | Animation |
|-------------|-----------|
| Chunk row selection | Smooth background color transition (150ms ease), row gently lifts with subtle shadow |
| View switching (sidebar) | Content area crossfade transition (200ms) |
| Image enlarge/dismiss | Scale + fade modal overlay (250ms spring), backdrop blur-in |
| Image zoom (in modal) | Smooth CSS transform scale with wheel delta, inertial feel |
| Thumbnail panel scroll | Page thumbnail crossfade when page changes on scroll |
| Editor panel expand/collapse | Height animation with spring physics (framer-motion layout) |
| Table pagination | Fade-slide transition for chunk rows entering/leaving |
| Chunking strategy change | Loading skeleton shimmer while processing, then rows animate in |
| Sidebar file tree | Expand/collapse with height animation |
| Feedback emoji selection | Pop-in scale animation (200ms spring) |
| Keyword search highlight | Highlights fade in (150ms) when search term matches |
| Login/logout transition | Full-page crossfade |
| Hover states | All interactive elements have 100ms transition on hover (color, shadow, scale) |

## Feedback System

Five emoji categories per chunk:

| Emoji | Type | Meaning |
|-------|------|---------|
| ✅ | `correct` | Content is correct |
| ❌ | `incorrect` | Content is incorrect |
| ✏️ | `needs_edit` | Content needs editing |
| ❓ | `unclear` | Content is unclear |
| ⚠️ | `partial` | Partially correct |

Each chunk gets one emoji + one text comment per user. Clicking the FB cell opens an emoji picker popover. Clicking the FB Comment cell loads the comment into the viewer/editor for editing.

## Modified / Diff View

When a user edits a chunk:
1. Original content is preserved in `chunk_edits.original_content`
2. Modified content saved to `chunk_edits.modified_content`
3. Chunk table shows a red dot in the Modified column
4. Clicking the Modified indicator shows a side-by-side or inline diff view (additions in green, deletions in red)
5. User can revert to original from the diff view

## Image Handling

- **Page thumbnails:** Generated server-side from `_layouts.pdf` using PyMuPDF, cached as JPEG files in `data/thumbnails/{document_id}/` (avoids writing to input data folders which may be read-only)
- **Chunk images:** Mapped by parsing `![](images/X_Y.jpg)` references in chunk content. Stored in `chunk_images` table with page_index, category, and bbox from `metadata.json`
- **Image modal:** Click any thumbnail to open a full-screen modal overlay
  - Mouse wheel to zoom in/out (smooth CSS transform)
  - Click-and-drag to pan when zoomed in
  - Close with Escape key or clicking outside
- **Thumbnail updates:** As user scrolls through chunks, the large page thumbnail updates to match the page_number of the currently visible/selected chunk

## PDF Viewer

The layout PDF (`_layouts.pdf`) is viewable in two ways:
- **Mini-thumbnails** in the thumbnail panel (page previews)
- **Full PDF viewer** opens in a modal using pdf.js when a thumbnail is clicked
  - Page navigation within the viewer
  - Zoom controls

## Auth System

SQLite-backed with pre-seeded users. JWT token-based sessions.

- Login screen is the entry gate — no access without authentication
- Token stored in localStorage, sent as Bearer header
- Sessions persist across browser refreshes
- Different users maintain separate feedback and edits per chunk
- Logout clears client-side token only (JWT is stateless, acceptable for this internal tool)

## Deployment

- Server: `app-host`
- FastAPI binds to `0.0.0.0` on a configurable port (default 8080)
- Frontend built with `npm run build`, served as static files by FastAPI
- SQLite database stored at `data/data_viewer.db`
- Input data folder path configurable (default: prompted at load time via UI)
- Embedding credentials stored as env vars: `EMBEDDING_ENDPOINT`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`

## Technical Notes

- **SQLite WAL mode:** `db.py` enables WAL mode (`PRAGMA journal_mode=WAL`) and foreign keys (`PRAGMA foreign_keys=ON`) for concurrent read/write support and CASCADE enforcement.
- **CORS:** FastAPI middleware configured for development (Vite dev server on different port). Production serves everything from one origin.
- **Semantic chunking async:** The embedding call for semantic chunking runs as a FastAPI BackgroundTask. The endpoint returns immediately with a task ID. Task state tracked in an in-memory dict (`{task_id: {status, progress, total, result}}`). The frontend polls via SSE (`/api/documents/{id}/chunk-status`) until completion, showing a progress skeleton in the chunk table.
- **Chunk text canonical source:** `chunks.content` stores the original chunked text. `chunk_edits.modified_content` stores user edits. The display layer prefers `modified_content` when a `chunk_edit` exists. Search queries use `COALESCE(chunk_edits.modified_content, chunks.content)`.
- **Minimum viewport:** 1280px width. No mobile responsive design required (internal desktop tool).
