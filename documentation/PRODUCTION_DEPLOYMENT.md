# Data Viewer — Production Deployment Report (100 Concurrent Users)

> Target: run the platform reliably for ~100 concurrent users without degrading
> the platform host (`veda-host`) or crashing the shared Qwen vLLM deployment
> (`llm-host`).

## 1. How it is currently deployed

| Aspect | Current state |
|---|---|
| **Runtime** | Single Docker container `data-viewer` (`restart: unless-stopped`), host port `8082 → 8080` |
| **Server** | **One uvicorn process, no `--workers`** → a single event loop + one anyio threadpool (default 40 threads) |
| **Host** | `veda-host`, 48 cores / 93 GB RAM, **shared** with GPU training jobs, Elasticsearch, other uvicorns (host load avg ~37) |
| **Container limits** | **None** (`cpu.max = max`, mem = full host). No reservation either |
| **Frontend** | Built React served as static files **by the same uvicorn process** (`/assets` mount + catch-all) |
| **Database** | **SQLite** (WAL mode), single 3.9 MB file on a bind-mounted `./data` volume |
| **Auth** | Sync `def login`, 2 sequential LDAP binds per login (~1–1.7 s), bcrypt cost-12 on first login |
| **LLM** | Qwen3.5-122B-A10B on **vLLM** at `llm-host:9000`, `max_model_len=64000`. Shared module-level `httpx.AsyncClient` |
| **Embeddings** | BGE-M3 at `embedding-host:8000`. **New httpx client per call** (no pooling, unbounded) |
| **State** | In-memory dicts for chunking task progress (`_chunk_tasks`) → **breaks if you run >1 worker** |

**Bottom line:** a single-process dev/demo deployment. Three hard ceilings for
100 users: the single uvicorn process, SQLite write-locking, and unbounded
fan-out to the Qwen GPU.

## 2. Compute resources used per user

Measured baselines: idle container = **381 MB RAM, 0.2% CPU**. bcrypt login =
0.375 s CPU. LDAP login = ~1–1.7 s wall (mostly network wait). Users are **not**
uniform — split by activity:

### (a) Idle / browsing
- CPU negligible (~5–20 ms/request: SQLite SELECT + JSON).
- RAM ~2–5 MB per active request.
- **Network is the real cost:** MarkdownView loads **all** page thumbnails at once
  (~**92 MB for a 24-page doc**, layout PNGs up to 6.7 MB each), proxied through
  the backend from MinIO with no caching.

### (b) Login burst (start of workday)
- 2 LDAP binds (~1 s) + bcrypt (0.375 s CPU, first login only), in a **sync** handler.
- 100 simultaneous logins queue behind 40 threads + CPU-bound bcrypt on a
  contended host → logins serialize into tens of seconds.

### (c) Chunking
- Recursive/Markdown/Character: CPU-light, sub-second.
- **Semantic:** one BGE-M3 call per page (background task); load lands on `embedding-host`.

### (d) Evaluating a document (the expensive one)
- `evaluate_chunks_sse` runs **up to 5 chunks concurrently** (`Semaphore(5)`), each
  chunk = **2 parallel Qwen calls** (`rag_faq` + `ai_suggestion`) → **up to 10
  concurrent Qwen requests per evaluating user**.
- `ai_suggestion` base64-encodes the **full page PNG (~420 KB)** into a vision
  prompt — heavy GPU/KV-cache cost.
- Our CPU per eval is small; cost is **GPU time on llm-host** + one SQLite write/result.

| User type | veda-host CPU | veda-host RAM | Qwen GPU | Network |
|---|---|---|---|---|
| Idle/browsing | ~0 | ~5 MB | 0 | **High** (thumbnails) |
| Logging in | 0.375 s burst | ~5 MB | 0 | low |
| Chunking (semantic) | low | ~10 MB | 0 (BGE-M3) | medium |
| **Evaluating** | low–moderate | 10–30 MB | **up to 10 concurrent reqs** | medium |

The scarce resource is **not veda-host CPU/RAM** — it's (1) the single uvicorn
process, (2) SQLite write concurrency, and (3) the Qwen GPU.

## 3. What to change for 100 concurrent users

### 3.1 App server
- Run **gunicorn + N uvicorn workers** (start `4–8`, ~1–2 GB RAM each).
- ⚠️ Blocker: in-memory `_chunk_tasks` and the per-request LLM semaphore are
  process-local. Move shared state out of process **before** scaling workers.
- Make `login` async (or offload to threadpool) so one slow LDAP bind doesn't pin a worker.
- Put **nginx** in front: serve static frontend + thumbnails with cache headers,
  TLS termination, gzip, connection limiting.

### 3.2 Database
- SQLite-WAL = many readers, **one writer**. 100 users evaluating → write
  contention → `database is locked`. **Migrate to PostgreSQL** (SQLAlchemy already
  the ORM; mostly a URL + migration change).

### 3.3 Frontend / network
- **Lazy-load thumbnails** in MarkdownView (IntersectionObserver).
- Add `Cache-Control`/`ETag` to file/thumbnail proxy endpoints; cache in nginx
  (MinIO objects are immutable per doc).

### 3.4 Decouple heavy jobs
- Move evaluation + semantic chunking to a **job queue** with bounded workers.
- Store task progress in a **shared store** (DB/Redis), not a module dict.

### 3.5 Target topology
```
                 ┌────────── nginx ──────────┐
                 │ TLS, static, thumbnail     │
   100 users ──▶ │ cache, gzip, conn limiting │
                 └──────┬─────────────────────┘
            ┌───────────┴───────────┐
            │  gunicorn + 4–8        │   ── PostgreSQL (was SQLite)
            │  uvicorn workers       │   ── (Redis optional)
            └───────────┬───────────┘
                        │  GLOBAL bounded LLM queue
                        ▼
        Qwen vLLM (llm-host)   BGE-M3 (embedding-host)   MinIO   ES
```
Give the app its **own host or a CPU/RAM-reserved container** — not co-located
with GPU training that drives load avg to 37.

## 4. Impact on the Qwen deployment & how to keep it from crashing

Qwen is a **single shared vLLM instance** (`max_model_len=64000`). The app
currently fans out with **no global limit**.

### 4.1 What 100 users would do today
- Per evaluating user: **up to 10 concurrent requests** (`Semaphore(5)` × 2 calls),
  and the semaphore is **per-request/per-worker, not global** → 100 users ⇒
  theoretical **up to ~1,000 concurrent requests**.
- One accidental net: the shared `httpx.AsyncClient` defaults to
  `max_connections=100`, capping in-flight connections — **but only with a single
  worker**; multi-worker multiplies it, and the embedding client is uncapped.
- vLLM has finite `max_num_seqs` + KV cache. Many requests carry a **~560 KB
  base64 image** at up to 64k context. Flooding → KV exhaustion → requests queue →
  our 120 s `httpx` timeout fires → SSE writes **NULL scores** (the chunk-2330 bug)
  → cascading retries/timeouts; throughput collapses.

### 4.2 Optimizations
**A. One global concurrency limit for the whole app (most important).** Replace
per-request `Semaphore(5)` with a single process-wide (ideally cluster-wide)
semaphore sized to what vLLM sustains (~16–32 total), acquired by **every** LLM call.

**B. Job queue with backpressure** — bounded workers; users see "queued" not timeouts.

**C. Cut per-chunk cost.**
- Downscale/recompress the `ai_suggestion` page image (420 KB PNG → ~80 KB JPEG).
- **Cache scores** by `hash(content)`; combine prompts where possible.
- Make vision suggestion opt-in / skip for header-only chunks.

**D. Bound & pool every client** — explicit `httpx.Limits`, shared client incl.
embeddings, **retry w/ exponential backoff + jitter** on 429/503/timeout, lower
per-attempt timeout. Set vLLM `--max-num-seqs` so it returns 429 cleanly.

**E. Scale serving if needed** — multiple vLLM replicas behind a balancer, bigger
KV cache, or a smaller model for `ai_suggestion`. Continuous batching handles
steady moderate concurrency well — feed it a **bounded, batched stream**, not a burst.

**F. Capacity math** — measure avg eval latency (~1.9 s for a short chunk; more for
vision/long). If vLLM sustains ~20 req/s, a global cap of ~24 in-flight keeps it
safe; 100 users' work drains through the queue over time.

## Priority order
1. **Global LLM concurrency limit** — prevents Qwen overload. Cheapest, highest impact.
2. **Fix silent NULL-score failure** (retry; don't write partial results).
3. **PostgreSQL migration** — removes SQLite write-lock ceiling.
4. **gunicorn + N workers, shared task state** — removes single-process ceiling.
5. **nginx front + lazy-load thumbnails** — removes network bottleneck.
6. **Job queue + image downscaling + score caching** — cuts Qwen load further.
7. **Dedicated/limited host** for the app, off the GPU-training box.

---

## Implementation status (this branch)

- [x] Global LLM concurrency limit (`LLM_MAX_CONCURRENCY`, default 24) in `_call_llm`.
- [x] Retry w/ exponential backoff + jitter on 429/503/timeout; lower per-attempt timeout.
- [x] `ai_suggestion` page image downscaled + JPEG-recompressed before base64.
- [x] Content-hash score cache (skip re-eval of unchanged chunks).
- [x] PostgreSQL support — dialect-aware `db.py`, inspector-based migrations, dedicated `data_viewer` DB.
- [x] Chunk task progress stored in DB (`chunk_tasks` table) — safe for multi-worker.
- [x] gunicorn + uvicorn workers; Dockerfile/compose updated; Postgres + nginx in compose.
- [x] nginx reverse proxy config (static, thumbnail cache, gzip, conn limiting).
- [x] Thumbnail lazy-loading + HTTP cache headers on file endpoints.

### Tunable env vars (`.env`)
- `DATABASE_URL` — e.g. `postgresql+psycopg2://postgres:***@postgres-host:5433/data_viewer`. If unset, falls back to SQLite (`DB_PATH`).
- `LLM_MAX_CONCURRENCY` — global cap on in-flight Qwen requests (default `24`).
- `LLM_MAX_RETRIES` — retry attempts on transient LLM errors (default `3`).
- `LLM_TIMEOUT` — per-attempt LLM timeout seconds (default `60`).
- `AI_SUGGESTION_IMAGE_MAX_PX` — longest edge of downscaled vision image (default `1024`).
- `WEB_CONCURRENCY` — gunicorn worker count (default `4`).
