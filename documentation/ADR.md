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

- High concurrency may overwhelm the LLM server if there are many chunks — consider adding a semaphore/concurrency limit if this becomes an issue.
- SSE connections are long-lived; the frontend must handle connection drops gracefully.
- A shared `httpx.AsyncClient` is used for connection pooling across parallel requests.

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
