# Data Viewer - Requirements Specification

## Purpose

The Data Viewer project was created to solve a critical bottleneck in the RAG (Retrieval-Augmented Generation) pipeline evaluation workflow. Prior to this tool, teams had no efficient way to:

1. **Visually inspect** OCR-processed PDF documents that had been chunked for RAG use
2. **Evaluate chunk quality** — determining whether splits preserve semantic coherence, maintain sufficient context, and avoid cutting mid-sentence or mid-table
3. **Identify extraction errors** — pages where text was missed, tables were misread, or images were misplaced
4. **Systematically compare** chunking strategies — character-splitting vs. recursive vs. semantic vs. markdown vs. page-wise — on the same document
5. **Provide structured feedback** — annotating chunks and comments that feed back into pipeline improvement

The core purpose is to make the **human evaluation loop** for document processing pipelines fast, repeatable, and auditable.

---

## Abstract

Data Viewer is a full-stack web application that enables reviewers to load OCR-processed PDF documents, apply and compare multiple text-chunking strategies, receive AI-scored quality evaluations for each chunk (RAG usability + FAQ usability on a 0–10 scale), and record human feedback. It supports documents from two sources: locally loaded folders (the original mode) and Elasticsearch indices populated by the rag_anything pipeline (the integrated mode). All evaluation results, edits, and feedback are persisted in a local SQLite database for downstream analysis.

---

## Usecase

### Primary Usecase: Document Chunk Quality Review

A reviewer (typically a domain expert or NLP engineer) performs the following workflow:

1. **Load or import a document** — either by selecting a local processed-folder or by browsing an Elasticsearch index via the sidebar import dialog
2. **View extracted content** — markdown rendering, page thumbnails, table images, and figure images are all accessible in a unified multi-pane interface
3. **Select a chunking strategy** — the reviewer chooses from five strategies (Character, Recursive, Markdown, Semantic, Page-wise) and configures chunk size/overlap parameters
4. **Execute chunking** — the backend splits the document text according to the selected strategy and displays chunks in a sortable table with page numbers and image references
5. **Trigger AI evaluation** — the system automatically sends each chunk to the LLM (Qwen3.5-122B-A10B) for RAG/FAQ scoring; results stream back in real-time via SSE and populate the table cells
6. **Provide human feedback** — the reviewer clicks an emoji reaction and/or writes a comment on any chunk; this feedback is stored per-user and per-chunk
7. **Edit problematic chunks** — the reviewer can directly modify chunk text in the built-in editor; edits are tracked separately from the original content
8. **Review AI suggestions** — the AI also produces a per-page "extraction error" report comparing chunk text against the page screenshot; the reviewer can accept/reject findings
9. **Consult AI strategy review** — an AI-generated recommendation suggests which chunking strategy is best suited for this particular document, with reasoning

### Secondary Usecase: Chunking Strategy Comparison

An NLP engineer evaluating pipeline changes:

1. Loads a document using Strategy A → notes evaluation scores → switches to Strategy B → re-chunks and re-evaluates the same document
2. Uses the AI Review view to get a recommendation without manually toggling strategies
3. Exports the comparison by reading scores from the UI or querying the SQLite database directly

### Tertiary Usecase: Bulk Document Import from rag_anything

A data engineer onboarding new documents:

1. Opens the ES import dialog from the sidebar
2. Selects an Elasticsearch index (e.g., `rag_anything_prod`)
3. Browses available documents, seeing chunk counts and page counts per document
4. Multi-selects un-imported documents and triggers batch import
5. Documents appear in the sidebar immediately; thumbnails and markdown are served from MinIO transparently

---

## Data Source

### Local Folder Loading (original mode)

Documents are pre-processed by an external OCR/extraction pipeline that produces a standardized folder structure:

```
{_document_folder}/
  {pdf_name}_with_captions.mmd   # Full markdown with image/table references
  {pdf_name}_layouts.pdf          # Layout analysis PDF (annotated)
  metadata.json                    # Title, page count, parsing metrics
  images/
    {page}_{idx}.jpg              # Extracted figure images
  tables/
    {page}_{idx}.jpg              # Extracted table images
  thumbnails/
    page_{n}.jpg                  # Auto-generated page thumbnails
```

The folder must contain `metadata.json`. On load, the backend parses the markdown, generates page thumbnails (if not present), and triggers background AI review.

### Elasticsearch + MinIO (integrated mode)

Documents processed by the rag_anything pipeline are stored across two systems:

- **Elasticsearch** — stores chunk documents with full text, embeddings, and metadata including MinIO object paths
- **MinIO** — object storage for all binary/text assets: images, table images, page screenshots (from original PDF), markdown files, parsing metrics JSON, and layout PDFs

On import, the Data Viewer backend:
1. Queries Elasticsearch for all chunks matching a `parent_doc_id`
2. Creates local SQLite rows for each chunk (so all existing features work without modification)
3. Proxies all asset requests (images, markdown, thumbnails) through MinIO

---

## Relational System

The Data Viewer does not operate in isolation — it is the **human-evaluation frontend** for the broader rag_anything RAG pipeline:

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  rag_anything   │─────▶│  Elasticsearch   │◀───▶│  Data Viewer        │
│  (PDF ingest +  │      │  (chunk storage  │      │  (human evaluation  │
│   OCR + chunk)  │      │   + embeddings)  │      │   + feedback)       │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
         │                                                  ▲
         │                                                  │
         ▼                                                  │
  ┌──────────────────┐                                     │
  │     MinIO        │─────────────────────────────────────┘
  │  (images, tables │    (assets served via backend proxy)
  │   thumbnails,    │
  │   markdown,      │
  │   layout PDFs)   │
  └──────────────────┘
```

### Pipeline relationship

| Stage | System | Role |
|-------|--------|------|
| PDF ingest + OCR | rag_anything | Processes raw PDFs, extracts text/images/tables, generates markdown |
| Chunking + Embedding | rag_anything | Applies chunking strategy, generates BGE-M3 embeddings |
| Storage | Elasticsearch + MinIO | Persists chunks (ES) and assets (MinIO) |
| Human Evaluation | Data Viewer | Reviews chunks, scores quality, provides feedback |
| Feedback Loop | (future) | Feedback data informs rag_anything parameter tuning |

### Key relational properties

- One Elasticsearch `parent_doc_id` maps to one Data Viewer `Document` via import
- Each Elasticsearch chunk maps to one Data Viewer `Chunk` row
- MinIO `minio_metadata` paths in ES chunks tell Data Viewer where to fetch assets
- Data Viewer's `chunking_strategy` field on Document records which strategy was used when importing from ES (and can be overridden by re-chunking)

---

## About Performance

### Backend performance characteristics

| Operation | Expected latency | Notes |
|-----------|-----------------|-------|
| Document load (local folder) | 2–5 s | Thumbnail generation is the bottleneck (PyMuPDF rendering) |
| ES document import | 5–15 s per doc | Depends on chunk count; single ES query + MinIO fetch of parsing_metrics.json |
| Re-chunking (non-semantic) | <1 s | Pure text processing, no external calls |
| Re-chunking (semantic) | 5–30 s | Requires BGE-M3 embedding calls per chunk; parallelized with asyncio |
| LLM evaluation (per chunk) | 3–8 s | Qwen3.5-122B-A10B inference; 2 calls per chunk (RAG score + AI suggestion) |
| MinIO asset proxy | <500 ms | Backend streams bytes directly from MinIO |
| SSE evaluation streaming | real-time | Results pushed as soon as LLM responds; frontend updates incrementally |

### Concurrency considerations

- **LLM evaluation** launches chunk evaluations concurrently with no hard limit; a semaphore of 5 is recommended to avoid overwhelming the Qwen endpoint (configurable)
- **ES import** is sequential per-document (user-triggered, not bulk-parallel)
- **Semantic chunking** uses `asyncio.gather` with embedding calls parallelized; the embedding endpoint (embedding-host:8000) handles ~100 concurrent requests
- **SQLite** in WAL mode supports concurrent reads from multiple uvicorn workers

### Frontend performance characteristics

| Operation | Expected latency | Notes |
|-----------|-----------------|-------|
| Initial page load | 1–2 s | SPA with lazy-loaded routes |
| Document list render (100 docs) | <100 ms | Zustand store; simple list mapping |
| Chunk table (500 chunks) | <200 ms | Virtualization not yet implemented; table renders at once |
| SSE evaluation update | <50 ms per event | Individual cell update via Zustand `updateChunkEval()` |
| Markdown view render | <500 ms | react-markdown with GFM plugin |
| Image modal open | <200 ms | Preloads adjacent images for navigation |

### Known performance constraints

- **Large documents (500+ pages)** — thumbnail generation on load takes 30+ seconds; consider pre-generating thumbnails in the rag_anything pipeline
- **Semantic chunking with 1000+ chunks** — embedding calls become the bottleneck; consider batching
- **No pagination** — chunk table renders all chunks at once; for documents with >2000 chunks, the table may become slow
- **--reload flag** — using `uvicorn --reload` in production creates file-watcher processes that significantly increase CPU usage; always run without `--reload` in deployed environments

### Network dependencies

| Service | Host | Latency expectation |
|---------|------|---------------------|
| Qwen LLM | llm-host:9000 | 3–8 s per call (model inference) |
| BGE-M3 Embedding | embedding-host:8000 | 50–200 ms per call |
| MinIO | minio.hogehoge | <100 ms within same datacenter |
| Elasticsearch | es.hogehoge | <50 ms within same datacenter |