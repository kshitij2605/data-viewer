# Architecture Decision Records (ADR)

This document tracks major architectural decisions made during the development of the Data Viewer application.

---

## ADR-001: LLM-as-a-Judge for Chunk Quality Evaluation

**Date:** 2026-04-02
**Status:** Accepted

### Context

We needed a way to evaluate text chunk quality for two downstream use cases: RAG (Retrieval-Augmented Generation) and FAQ generation. Options considered:

1. **Heuristic metrics** (chunk length, keyword density, sentence count)
2. **Embedding-based similarity** (cosine similarity to reference chunks)
3. **LLM-as-a-Judge** (prompt an LLM to score each chunk)

### Decision

Use LLM-as-a-Judge with the deployed Qwen/Qwen3.5-122B-A10B model. Each chunk is evaluated on a 0-10 scale for RAG usability and FAQ usability using a structured rubric prompt.

### Rationale

- Heuristics only capture surface-level features (length, formatting) and miss semantic quality.
- Embedding similarity requires a curated reference set and doesn't generalize across document types.
- LLM-as-a-Judge can assess multi-dimensional quality (self-containedness, coherence, information density) in the target language (Japanese) without manual feature engineering.
- The evaluation model is the same architecture that will consume these chunks downstream, ensuring aligned judgment.

### Consequences

- Evaluation latency depends on LLM inference speed (~2-10s per chunk).
- Scores are non-deterministic (mitigated by temperature=0.1).
- No human-annotated validation baseline yet — scores should be treated as advisory, not authoritative.

See [chunk-evaluation-scoring.md](chunk-evaluation-scoring.md) for full scoring methodology.

---

## ADR-002: Multimodal AI Suggestion via Page Image Comparison

**Date:** 2026-04-02
**Status:** Accepted

### Context

Text extraction from PDFs can produce errors: missing paragraphs, garbled tables, broken formatting, lost image captions. Users need a way to verify chunk quality against the source page without manually comparing each one.

### Decision

Send each chunk's text alongside its corresponding page thumbnail (base64-encoded JPEG) to the multimodal Qwen model. The model compares the two and reports any discrepancies (missing text, misformatted tables, lost content).

### Rationale

- The Qwen3.5-122B model supports vision (image+text) inputs.
- Page thumbnails are already generated and stored during document loading.
- Automated comparison catches extraction errors that text-only analysis would miss.
- Fallback to text-only analysis when no page image is available.

### Consequences

- Image encoding adds payload size (~50-200KB per request).
- Thumbnail resolution (50% scale) may miss fine text details — acceptable for structural comparison.
- The model may not catch all OCR errors, especially in dense tables.

---

## ADR-003: Parallel Evaluation with SSE Streaming

**Date:** 2026-04-02
**Status:** Accepted

### Context

Evaluating all chunks sequentially is too slow (N chunks x ~5s each). The previous implementation used a background task with polling every 3 seconds, which was laggy and wasted network round-trips.

### Decision

1. **All chunks launch evaluation concurrently** via `asyncio.create_task` — not sequentially.
2. **Per-chunk, RAG/FAQ scoring and AI suggestion run in parallel** via `asyncio.gather`.
3. **Results stream to the frontend via Server-Sent Events (SSE)** — each completed chunk is pushed immediately.
4. **Frontend updates the store per-chunk** without refetching the entire chunk list.

### Rationale

- Concurrent chunk evaluation reduces wall-clock time from O(N * T) to approximately O(T) where T is the slowest single evaluation (bounded by LLM server concurrency).
- SSE provides push-based delivery without polling overhead.
- The existing codebase already uses `sse-starlette` for chunk processing status, so the pattern is established.
- Per-chunk store updates (`updateChunkEval`) avoid re-rendering the entire table on each result.

### Consequences

- ~~High concurrency may overwhelm the LLM server if there are many chunks — consider adding a semaphore/concurrency limit if this becomes an issue.~~ **Resolved by ADR-010**: a global per-process `asyncio.Semaphore` now caps in-flight requests.
- SSE connections are long-lived; the frontend must handle connection drops gracefully.
- A shared `httpx.AsyncClient` with a bounded connection pool is used across parallel requests.

---

## ADR-004: Page-Synced Markdown View with Split Layout

**Date:** 2026-04-02
**Status:** Accepted

### Context

Users viewing the markdown-rendered document content had no way to cross-reference it with the original PDF pages. Switching between views was disruptive to the review workflow.

### Decision

Implement a split-pane layout in Markdown view: text on the left, scrollable PDF page thumbnails on the right. The markdown content is split by page delimiter (`---`) and an `IntersectionObserver`-like scroll handler detects which page section the user is reading, automatically scrolling the right pane to the corresponding page thumbnail.

### Rationale

- The backend already splits markdown into pages using `\n---\s*\n?` — reusing the same delimiter in the frontend ensures page boundaries align.
- Scroll-based detection (checking which section's top has passed the viewport) is simpler and more reliable than IntersectionObserver for this "first visible section" use case.
- The right pane width is user-resizable via a draggable divider for flexible layout.

### Consequences

- Page detection accuracy depends on the `---` delimiter being consistently placed by the document parser.
- Documents without page delimiters will show as a single section — all thumbnails remain visible but auto-scroll won't activate.

---

## ADR-005: Unified Image Navigation in Modal

**Date:** 2026-04-02
**Status:** Accepted

### Context

The ImageModal component originally only displayed a single image with zoom/drag. Users needed to browse through related content (page thumbnails, document images) without closing and reopening the modal.

### Decision

Extend ImageModal with generic navigation (prev/next buttons + arrow keys) that works for both page thumbnails and document images. The navigation context (page-based or image-list-based) is determined by the caller:

- **ThumbnailPanel**: passes `pageNum`, `numPages` — navigation fetches page thumbnails + markdown.
- **ImagesOnlyView**: passes a pre-built image list — navigation indexes into the list.
- **MarkdownView**: passes page info for thumbnail clicks.

A `slideDir` state tracks direction and drives 250ms slide-in/slide-out animations via Framer Motion.

### Rationale

- Reusing a single modal component avoids duplication and keeps the UX consistent.
- The direction-aware slide animation gives spatial context (left = previous, right = next).
- Setting `slideDir` synchronously in the click handler (not in a `useEffect`) ensures the animation direction is correct on the first click when reversing.

### Consequences

- The modal props interface is growing (open, src, alt, pageMarkdown, pageNum, numPages, onPageChange) — may warrant a context/config object if more features are added.

---

## ADR-006: Feedback System with Independent Comment and Emoji

**Date:** 2026-04-02
**Status:** Accepted

### Context

The original feedback system required an emoji_type when saving feedback. Setting a comment in the ViewerEditor forced a default "correct" emoji, and changing the emoji in the ChunkTable dropdown overwrote the comment with an empty string.

### Decision

Make `emoji_type` nullable in the backend (`FeedbackRequest` model accepts `None`). The frontend:
- Saves comments without forcing an emoji selection.
- Preserves existing comments when only the emoji changes.
- Allows deselecting an emoji by choosing the empty "—" option.

### Rationale

- Comments and emoji are semantically independent — a reviewer may want to leave a note without making a quality judgment.
- The previous coupling caused data loss (comments silently deleted when changing emoji).

### Consequences

- The database may have feedback rows with `emoji_type=NULL` and only a comment — query logic must handle this.

---

## ADR-007: Two-Phase AI Chunking Strategy Review

**Date:** 2026-04-03
**Status:** Accepted

### Context

Users need guidance on which chunking strategy and parameters to use for each document. Initial attempts at a single-prompt approach failed because:
- Truncating the document to fit the context window caused the LLM to miss large tables and sections at the end, producing incorrect size estimates.
- The LLM produced generic advice ("integrated reports typically have sections of 500-1000 characters") instead of document-specific recommendations.

### Decision

Implement a two-phase approach using the full 64k model context window:

1. **Phase 1 — Analysis**: Send the entire document markdown to the LLM (split into ~50k character parts if needed, with parallel analysis of each part). The LLM is instructed to measure exact section names, character counts, table sizes, and structural patterns — not to guess or generalize.
2. **Phase 2 — Recommendation**: Feed the analysis results into a second prompt that generates strategy recommendations. The prompt explicitly requires citing actual section names and measured sizes, and forbids generic advice.

The AI review triggers automatically when a document is loaded, with results stored in the `ai_review` column on the documents table. A "再分析" (re-analyze) button allows manual re-triggering.

### Rationale

- Two-phase analysis ensures the LLM has seen the entire document before making recommendations, even for documents that exceed a single prompt's capacity.
- Parallel part analysis keeps latency manageable for large documents.
- Explicit instructions to measure (not estimate) section sizes and cite actual content produce significantly more accurate and useful recommendations.
- Storing results in the database avoids re-running expensive LLM calls on every view.

### Consequences

- Two LLM calls per document (or more for very large documents) increases latency and cost compared to a single-call approach.
- Analysis quality depends on the LLM faithfully measuring sections rather than guessing — the prompt enforces this but cannot guarantee it.
- Results may become stale if the document's markdown is re-extracted; the retry button addresses this.

---

## ADR-008: Table Image Viewer with Extracted HTML Tables

**Date:** 2026-04-08
**Status:** Accepted

### Context

The OCR pipeline extracts tables from PDFs as both images (`tables/` folder) and HTML `<table>` elements in the `.mmd` markdown file. The format in the markdown is:

```
![](tables/11_10.jpg)

<table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>
```

Users needed to view the original table image alongside its extracted structured content to verify extraction quality.

### Decision

1. **Backend**: Add `extract_table_html_map()` in `markdown_parser.py` that parses the `.mmd` file for `![](tables/FILENAME)` patterns followed by `<table>...</table>` blocks, returning a `{filename: html_string}` mapping. The `/tables-only` endpoint returns this map alongside the table image list.
2. **Frontend**: When a user clicks a table image in `TablesOnlyView`, the `ImageModal` opens with the table image on the left and the extracted HTML table rendered on the right. The modal detects HTML content (starts with `<table`) and renders it via `dangerouslySetInnerHTML` instead of the markdown renderer.
3. **Fallback**: If no HTML table is found for a given table image, the modal shows only the filename (no description).

### Rationale

- The HTML `<table>` content is already present in the `.mmd` file directly after the table image reference — parsing this pattern is straightforward and requires no additional extraction step.
- Rendering raw HTML tables preserves the exact structure (colspan, rowspan, nested elements) that a markdown-to-table conversion would lose.
- Reusing the existing `ImageModal` component with a content-type check keeps the codebase simple.

### Consequences

- Raw HTML is rendered via `dangerouslySetInnerHTML` — acceptable since the content comes from our own OCR pipeline, not user input.
- Table images without a corresponding HTML block in the `.mmd` file will show no extracted content.

---

## ADR-009: PostgreSQL as Production Database

**Date:** 2026-06-08
**Status:** Accepted

### Context

The original deployment used SQLite with WAL mode. When scaled to multiple gunicorn workers, SQLite's single-writer-at-a-time lock caused `OperationalError: database is locked` during concurrent chunking jobs (bulk INSERTs holding the write lock for seconds while other workers tried to read or write).

### Decision

Add `DATABASE_URL` to config. When set, `get_engine()` creates a PostgreSQL engine with connection pooling (`pool_size=5, max_overflow=10, pool_pre_ping=True`). SQLite remains the fallback when `DATABASE_URL` is empty, preserving the single-developer local workflow.

Schema migrations use `inspector.get_columns()` instead of `PRAGMA table_info` so the same `ALTER TABLE` migration runs on both engines.

### Rationale

- PostgreSQL's MVCC allows true concurrent readers and writers — no write lock contention across workers.
- `pool_pre_ping=True` recovers from dropped idle connections transparently.
- The fallback to SQLite means no migration burden for developers running locally.

### Consequences

- Production requires a reachable PostgreSQL server.
- Fresh cutover (empty DB) was chosen over data migration — users re-load documents from the source systems.
- SQLite WAL is still used for local dev and retains `PRAGMA busy_timeout=5000` to handle the rare concurrent write under a single process.

---

## ADR-010: Global Per-Process LLM Concurrency Semaphore

**Date:** 2026-06-08
**Status:** Accepted

### Context

Without throttling, evaluating a 2000-chunk document fires up to 4000 concurrent HTTP requests to the shared Qwen3.5-122B vLLM deployment. At 100 users this saturates GPU VRAM, triggers OOM kills, and causes 429/503 cascades for all users.

### Decision

Add a module-level `asyncio.Semaphore(LLM_MAX_CONCURRENCY)` in `llm_eval.py`. Every LLM request — RAG/FAQ scoring, AI suggestion, and chunking review — must acquire the semaphore before sending the HTTP request. The httpx connection pool is bounded to the same limit. Transient failures are retried with exponential backoff + jitter up to `LLM_MAX_RETRIES`.

The total server-wide cap = `WEB_CONCURRENCY × LLM_MAX_CONCURRENCY`. With defaults of `4 × 6 = 24`, the GPU sees at most 24 in-flight requests regardless of how many users trigger evaluations simultaneously.

### Rationale

- The semaphore is the only reliable way to bound GPU pressure — request queuing at the LLM server level is too late (OOM happens before the queue rejects).
- Per-process (not shared across workers) semaphores are simpler and correct: each worker independently limits its own share.
- Backoff with jitter prevents thundering-herd retry spikes when the GPU recovers from a 429 burst.

### Consequences

- Under sustained load from many users, individual evaluation requests queue behind the semaphore, increasing per-user latency. This is the correct trade-off — slow but reliable beats fast and crashing.
- `LLM_MAX_CONCURRENCY` must be tuned based on the vLLM instance's capacity. Current default: 6 per worker.

---

## ADR-011: nginx Reverse Proxy with Asset Cache

**Date:** 2026-06-08
**Status:** Accepted

### Context

The app container was published directly on the host port. This exposed gunicorn workers to slow clients (a slow browser holds a worker socket open for its entire download duration), had no caching for immutable assets (every page view re-fetched thumbnails from MinIO), and had no rate limiting against burst traffic.

### Decision

Add an nginx:1.27-alpine container in docker-compose.yml. The app container is no longer published on the host; only nginx is. `deploy/nginx.conf` configures:
- **Asset cache** (`proxy_cache_path`, 5 GB, 7 days) for document images, thumbnails, and markdown. Cache key strips `?token=` so all users share one cached copy.
- **SSE pass-through** (`proxy_buffering off`, `proxy_read_timeout 3600s`) for evaluate-chunks and chunk-status endpoints.
- **Rate limiting** (`limit_req 30r/s, burst 60`) and connection limiting per IP.
- **gzip** for JSON and text responses.
- **Keepalive 32** to the upstream to reuse connections.

The backend emits `Cache-Control: public, max-age=604800` for cacheable asset URLs via an HTTP middleware in `main.py`.

### Rationale

- nginx buffers slow clients in kernel space and releases the upstream connection immediately after the response is sent, freeing gunicorn workers for the next request.
- The nginx asset cache eliminates MinIO round-trips for repeat views — in a 20-user session on a 500-page document, this saves hundreds of MinIO requests per session.
- SSE endpoints need special handling (`proxy_buffering off`) that nginx provides cleanly.

### Consequences

- Two containers instead of one; `docker compose down` stops both.
- Cache must be invalidated when a document is deleted or re-loaded (currently not done — documents use unique IDs so old paths are never reused).
- TLS termination placeholder is in nginx.conf but not yet activated (internal tool on trusted network).

---

## ADR-012: LDAP Server Object Caching

**Date:** 2026-06-10
**Status:** Accepted

### Context

Every login call rebuilt a new `ldap3.Server` object with `get_info=ALL`, which caused the library to fetch the full LDAP server schema (DSE, naming contexts, schema) on the first connection for each login attempt. This added ~500 ms per login, compounding with bcrypt hashing (~375 ms for new users) and two sequential TCP connections.

### Decision

1. **Cache the `Server` object** as a module-level singleton (`_ldap_server`) in `ldap_auth.py`. It is created once per gunicorn worker process and reused for all subsequent logins.
2. **Switch `get_info=ALL` to `get_info=NONE`**. The schema is never needed for authentication, so fetching it is pure overhead.
3. **Add `connect_timeout=5`** on `Server` and `receive_timeout=10` on each `Connection` so unreachable DCs fail fast instead of hanging the login request indefinitely.
4. **Replace `bcrypt.hash()` with a sentinel** (`"!ldap-" + token`) when storing the placeholder password for new LDAP-authenticated users. bcrypt at cost 12 costs ~375 ms — unnecessary for a value that is never verified.

### Rationale

- `get_info=NONE` is the single largest win: it eliminates a schema fetch that was happening on effectively every login.
- The cached `Server` singleton avoids DNS resolution overhead on repeat logins.
- The sentinel pattern is safe because LDAP users never reach the local `verify_password()` path — the login handler returns after a successful LDAP bind.

### Consequences

- The `Server` singleton is per-process (not shared across gunicorn workers), so each of the 4 workers makes one DNS lookup and one schema-less connection on its first login. Subsequent logins on that worker skip both.
- If the LDAP server's address changes, the container must be restarted to rebuild the singleton.
