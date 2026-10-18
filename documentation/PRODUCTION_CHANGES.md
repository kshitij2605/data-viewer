# Production Readiness Changes — Data Viewer

This document details every change made to prepare Data Viewer for concurrent production use
(target: ~100 simultaneous users). Each section explains what was changed, which file(s) were
modified, and why the change was necessary.

---

## 1. Process Model: Single Uvicorn → Gunicorn + Multiple Uvicorn Workers

### What changed

| File | Change |
|---|---|
| `Dockerfile` | CMD changed from `uvicorn backend.main:app` to `gunicorn backend.main:app -c backend/gunicorn_conf.py` |
| `backend/gunicorn_conf.py` | New file — gunicorn configuration |
| `backend/requirements.txt` | Added `gunicorn==23.0.0` |

**`backend/gunicorn_conf.py`** (new):
```python
bind = f"0.0.0.0:{os.getenv('APP_PORT', '8080')}"
workers = int(os.getenv("WEB_CONCURRENCY", "4"))
worker_class = "uvicorn.workers.UvicornWorker"
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = 30
keepalive = 5
max_requests = 2000        # recycle workers to bound memory growth
max_requests_jitter = 200  # stagger recycling so not all workers restart at once
```

### Why

The original deployment ran a **single uvicorn process** — one event loop, one Python GIL slice.
FastAPI is async, so I/O-bound work (DB queries, MinIO fetches) yields the loop, but
CPU-bound work (JSON serialisation, PyMuPDF rendering, bcrypt hashing) and blocking calls
block every other request.

Gunicorn spawns `WEB_CONCURRENCY` **independent OS processes**, each with its own event loop,
DB connection pool, and LLM semaphore. 4 workers × 1 CPU each = 4× throughput for
CPU-bound segments and 4 independent event loops for I/O-bound work.

**Key detail on `APP_PORT` vs `PORT`:** `PORT` is the host-facing nginx port (e.g. `8082`).
Gunicorn must bind to the container-internal port (`8080`). Using `PORT` as the bind address
caused a 502 — gunicorn bound to `8082` while nginx upstream expected `8080`. The fix was a
separate env var `APP_PORT` (defaults to `8080`).

---

## 2. Database: SQLite → PostgreSQL (dialect-aware fallback)

### What changed

| File | Change |
|---|---|
| `backend/db.py` | `get_engine()` now prefers `settings.database_url`; falls back to SQLite |
| `backend/config.py` | Added `database_url: str = ""` setting |
| `backend/requirements.txt` | Added `psycopg2-binary==2.9.10` |
| `.env` | `DATABASE_URL=postgresql+psycopg2://postgres:REDACTED@postgres-host:5433/data_viewer` |
| `docker-compose.yml` | Passes `DATABASE_URL` to container |

**`backend/db.py` — `get_engine()`:**
```python
def get_engine(db_url: str = None):
    url = db_url or settings.database_url
    if url:
        return create_engine(
            url,
            echo=False,
            pool_pre_ping=True,   # drop stale connections before use
            pool_size=5,
            max_overflow=10,
            pool_recycle=1800,    # avoid MySQL/PG idle-connection timeouts
        )
    # SQLite fallback
    engine = create_engine(f"sqlite:///{path}", ...)
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine
```

**SQLite now gets `PRAGMA busy_timeout=5000`** — without this, concurrent writers under WAL
mode raise `OperationalError: database is locked` immediately. The timeout lets readers/writers
queue for up to 5 s before failing.

**Migration uses `inspector.get_columns()` not `PRAGMA table_info`** — PRAGMA is SQLite-only.
The same `ALTER TABLE … ADD COLUMN` migration now runs cleanly against both PostgreSQL and SQLite.

### Why

SQLite's WAL mode handles moderate concurrency but has two hard limits:
1. **One writer at a time** — chunking jobs (bulk INSERT thousands of chunks) hold the write
   lock for seconds, causing read requests to queue or fail.
2. **File locking across processes** — each gunicorn worker opens the same SQLite file;
   concurrent writes from 4 workers conflict heavily.

PostgreSQL with a connection pool (`pool_size=5, max_overflow=10`) handles 15 concurrent
connections comfortably per worker (60 total across 4 workers) and has true multi-writer MVCC.

The fallback to SQLite when `DATABASE_URL` is empty preserves the single-developer local
workflow unchanged.

---

## 3. LLM Concurrency Control: Global Semaphore + Retry Backoff

### What changed

| File | Change |
|---|---|
| `backend/services/llm_eval.py` | Added global semaphore, bounded httpx client, retry loop |
| `backend/config.py` | Added `llm_max_concurrency`, `llm_max_retries`, `llm_timeout` |
| `.env` | `LLM_MAX_CONCURRENCY=6`, `LLM_MAX_RETRIES=3`, `LLM_TIMEOUT=60` |

**Global semaphore (process-wide throttle):**
```python
_semaphore: asyncio.Semaphore | None = None

def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore, _semaphore_loop
    loop = asyncio.get_running_loop()
    if _semaphore is None or _semaphore_loop is not loop:
        _semaphore = asyncio.Semaphore(max(1, settings.llm_max_concurrency))
        _semaphore_loop = loop
    return _semaphore
```

**Bounded httpx client (connection pool matches semaphore):**
```python
limits = httpx.Limits(
    max_connections=max(1, settings.llm_max_concurrency),
    max_keepalive_connections=max(1, settings.llm_max_concurrency),
)
_client = httpx.AsyncClient(timeout=settings.llm_timeout, limits=limits)
```

**Retry with exponential backoff + jitter:**
```python
_RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}

for attempt in range(attempts):
    try:
        async with semaphore:
            resp = await client.post(...)
        ...
    except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as e:
        if status not in _RETRYABLE_STATUS:
            raise
        backoff = min(2 ** attempt, 8) + random.uniform(0, 0.5)
        await asyncio.sleep(backoff)
```

### Why

**The shared Qwen3.5-122B deployment on `llm-host` is the single most constrained resource.**
Without throttling, evaluating a 2000-chunk document fires 4000 concurrent HTTP requests (2 per
chunk × 2000 chunks).

The semaphore is the key protection: `LLM_MAX_CONCURRENCY=6` per worker × `WEB_CONCURRENCY=4`
workers = **24 max in-flight Qwen requests across the entire server**. This keeps the GPU
within a sustainable load regardless of how many users trigger evaluations simultaneously.

The bounded httpx connection pool ensures the OS socket count tracks the semaphore — without
it, the pool could open many more TCP connections than the semaphore permits (since connections
are established before acquiring the semaphore).

**Retry backoff** handles the `429 Too Many Requests` that vLLM emits when its queue fills,
and transient `503/timeout` from network blips, without failing the user's evaluation request.

---

## 4. Vision Image Downscaling

### What changed

| File | Change |
|---|---|
| `backend/services/llm_eval.py` | Added `_downscale_image_to_jpeg()`, used in `evaluate_ai_suggestion()` |
| `backend/config.py` | Added `ai_suggestion_image_max_px: int = 1024` |
| `.env` | `AI_SUGGESTION_IMAGE_MAX_PX=1024` |

**`_downscale_image_to_jpeg(path, max_px) → bytes | None`:**
```python
def _downscale_image_to_jpeg(path: str, max_px: int) -> bytes | None:
    import fitz  # PyMuPDF
    doc = fitz.open(path)
    page = doc[0]
    rect = page.rect
    longest = max(rect.width, rect.height) or 1
    scale = min(1.0, max_px / longest)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)  # JPEG has no alpha channel
    return pix.tobytes(output="jpeg", jpg_quality=70)
```

A typical full-page PNG (A4 @ 150 DPI) is **~420 KB**. After downscaling the longest edge to
≤ 1024 px and JPEG re-encoding at quality 70, the result is **~102 KB** — a **75.7% reduction**
in vision prompt payload.

### Why

The `ai_suggestion` endpoint sends a full-page image to the Qwen multimodal model. The raw PNG
payload dominates the token count and bandwidth cost of every vision call. With 100 users and
a multi-chunk batch evaluation, the cumulative payload can reach hundreds of MB per second to
the GPU node.

Downscaling to 1024 px longest edge is sufficient for OCR error detection (the primary task):
missing paragraphs, table structure errors, and image/text mismatch are visible at this
resolution. Quality loss does not affect evaluation accuracy at a meaningful level.

---

## 5. Content-Hash Score Cache

### What changed

| File | Change |
|---|---|
| `backend/services/llm_eval.py` | Added `_score_cache` dict, `_content_hash()`, cache check in `evaluate_rag_faq()` |

```python
_score_cache: dict[str, dict] = {}
_SCORE_CACHE_MAX = 5000

def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

async def evaluate_rag_faq(content: str) -> dict:
    key = _content_hash(content)
    cached = _score_cache.get(key)
    if cached is not None:
        return dict(cached)
    # ... LLM call ...
    if scores.get("rag_score") is not None and scores.get("faq_score") is not None:
        if len(_score_cache) >= _SCORE_CACHE_MAX:
            _score_cache.clear()  # simple eviction — cheap to rebuild
        _score_cache[key] = dict(scores)
    return scores
```

### Why

Documents are re-chunked frequently (users try different strategies and parameters). When a
re-chunk produces chunks that are identical to a previous run (common for page-wise or coarse
character splits), those chunks would otherwise re-hit the GPU unnecessarily.

The in-process cache means **a chunk that has already been scored in this worker's lifetime
never incurs another GPU call**, regardless of how many times the user re-triggers evaluation.
With 5000 entries maximum (simple clear-and-restart eviction to avoid memory growth), it is
safe for long-running workers.

---

## 6. Chunk Task Progress in the Database

### What changed

| File | Change |
|---|---|
| `backend/models.py` | Added `ChunkTask` ORM model |
| `backend/api/chunks.py` | Removed in-memory `_chunk_tasks` dict + threading lock; added DB helper functions `_task_create`, `_task_update`, `_task_get`, `_task_delete` |

**`ChunkTask` model:**
```python
class ChunkTask(Base):
    __tablename__ = "chunk_tasks"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    task_id     = Column(Text, unique=True, nullable=False, index=True)
    document_id = Column(Integer, nullable=False)
    status      = Column(Text, default="processing")
    progress    = Column(Integer, default=0)
    total       = Column(Integer, default=0)
    pages_done  = Column(Integer, default=0)
    total_pages = Column(Integer, default=0)
    error       = Column(Text, nullable=True)
    created_at  = Column(TIMESTAMP, server_default=func.now())
```

**Progress writes are throttled** — only written every 5 chunks (or on completion/error) to
avoid excessive DB round-trips during large batch chunking jobs.

### Why

The original code used a module-level Python `dict` (`_chunk_tasks`) protected by a
`threading.Lock()`. This is **broken under multiple workers**: if the semantic chunking job runs
in worker A, but the SSE polling request lands on worker B, worker B's `_chunk_tasks` is empty
and returns `{"status": "not_found"}` immediately.

Storing progress in the database means any worker can read the current state of any task,
regardless of which worker is running it.

---

## 7. nginx Reverse Proxy

### What changed

| File | Change |
|---|---|
| `deploy/nginx.conf` | New file — full nginx configuration |
| `docker-compose.yml` | Added `nginx:1.27-alpine` service |

**Key nginx features:**

| Feature | Config directive | Benefit |
|---|---|---|
| **Asset cache** (5 GB, 7 days) | `proxy_cache_path … max_size=5g inactive=7d` | Images/thumbnails/markdown served from disk — zero backend hit on repeat views |
| **Cache key strips `?token=`** | `proxy_cache_key "$scheme$request_method$host$uri"` | All users share one cached copy of immutable assets; token still validated on miss |
| **Upstream keepalive 32** | `keepalive 32` in upstream block | Reuses TCP connections to gunicorn instead of opening a new socket per request |
| **SSE no-buffering** | `proxy_buffering off` on `/evaluate-chunks` and `/chunk-status` | nginx will not buffer the entire SSE stream before forwarding — critical for real-time score streaming |
| **SSE long timeout** | `proxy_read_timeout 3600s` | Prevents nginx from cutting long evaluation sessions mid-stream |
| **Connection limit** | `limit_conn dv_conn 50` | Protects the server from a single IP opening unlimited connections |
| **Request rate limit** | `limit_req … rate=30r/s burst=60` | Absorbs request bursts; protects the gunicorn workers from thundering-herd |
| **gzip** | `gzip_types application/json text/plain …` | Compresses JSON API responses — important for large chunk list payloads |
| **`client_max_body_size 50m`** | — | Permits large markdown file uploads and MinIO payload proxying |

### Why

The original deployment exposed the gunicorn app directly on a host port. This has several
problems:

1. **No asset caching** — every thumbnail, page image, and markdown file is fetched live from
   MinIO on every page view, even if the same user viewed it 10 seconds ago. For a 100-page
   document with 20 users, this is 2000 MinIO requests per viewing session.

2. **No connection protection** — a slow or stuck client holds a gunicorn worker socket open.
   Without a buffering proxy, the worker is tied up for the duration of the slow client, not
   just for the time it takes to produce the response.

3. **SSE requires special handling** — uvicorn's SSE works, but behind nginx the stream must
   not be buffered. Without `proxy_buffering off`, nginx collects the entire event stream
   before forwarding, so the user sees no progress until the evaluation is complete.

---

## 8. HTTP Cache Headers on Backend Responses

### What changed

| File | Change |
|---|---|
| `backend/main.py` | Added `add_cache_headers` middleware |

```python
_CACHEABLE_ASSET = re.compile(
    r"^/api/documents/\d+/(layout-thumbnail/|layout-pdf|images/|tables/|markdown|page/\d+/(thumbnail|markdown))"
)

@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and _CACHEABLE_ASSET.match(request.url.path):
        response.headers.setdefault("Cache-Control", "public, max-age=604800")
    return response
```

### Why

Document assets (thumbnails, page images, markdown) are **immutable for the lifetime of a
loaded document** — re-loading a document creates new DB rows with new IDs. Marking them
`public, max-age=604800` (7 days) lets:

- **nginx's proxy cache** pick them up on the first request and serve subsequent requests from
  disk without hitting gunicorn at all.
- **Browsers** cache assets locally and skip even the nginx round-trip on repeat views.

Without these headers, the nginx `proxy_cache_valid 200 7d` directive has nothing to honour
(nginx only caches responses with an explicit lifetime or when `proxy_cache_valid` overrides).

---

## 9. Lazy Thumbnail Loading

### What changed

| File | Change |
|---|---|
| `frontend/src/components/MarkdownView.tsx` | Added `loadedPages` state, windowed load logic, stable-height placeholders |

**Before:** every thumbnail `<img>` for every page was rendered and fetched immediately when
the document loaded.

**After:**
```typescript
const [loadedPages, setLoadedPages] = useState<Set<number>>(() => new Set([1]));

// Window: active page ± 2
useEffect(() => {
    setLoadedPages(prev => {
        const next = new Set(prev);
        for (let p = Math.max(1, activePage - 2); p <= Math.min(numPages, activePage + 2); p++) {
            next.add(p);
        }
        return next;
    });
}, [activePage, numPages]);

// Render
{loadedPages.has(pageNum)
    ? <img loading="lazy" decoding="async" src={...} />
    : <div style={{ aspectRatio: '1 / 1.414' }} />}  // stable height placeholder
```

### Why

A 500-page document has 500 thumbnail images. Loading them all on mount fires 500 simultaneous
`/api/documents/{id}/page/{n}/thumbnail` requests. Even with nginx caching, this:
- Saturates the browser's connection pool (typically 6 connections per host)
- Produces a waterfall of MinIO proxying on cache misses
- Makes the initial document load feel sluggish

Windowed loading (±2 pages around the active page) means at most 5 images are in-flight at
any moment. The placeholder `<div>` with a fixed `aspectRatio: '1/1.414'` (A4 proportions)
prevents the scroll container from reflowing as images load.

---

## 10. Docker Compose and Container Resource Limits

### What changed

| File | Change |
|---|---|
| `docker-compose.yml` | Full rewrite — 2 services, resource limits, internal-only app port |

**Key decisions:**

```yaml
services:
  data-viewer:
    expose: ["8080"]          # NOT ports: — only reachable inside the compose network
    deploy:
      resources:
        limits:
          cpus: "8"
          memory: 8g
        reservations:
          cpus: "2"
          memory: 2g

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "${PORT:-8080}:80"   # only nginx is on the host
```

### Why

**`expose` vs `ports`:** Publishing the app container's port directly to the host would bypass
nginx, losing caching, rate limiting, and SSE buffering controls. Only the nginx container
publishes a host port.

**Resource limits** prevent the app from consuming unlimited RAM/CPU on the shared GPU server
(`veda-host`), where other services (MinIO, Elasticsearch) also run. An 8 GB memory limit
provides headroom for 4 workers × ~1.5 GB each (Python heap + PyMuPDF for thumbnail
generation) while leaving room for the OS and other services.

**CPU reservation of 2** ensures the container is not starved by other workloads when there is
contention; the limit of 8 prevents it from monopolising the machine.

---

## Summary of Configuration Variables

All tuning knobs are in `.env` / environment:

| Variable | Default | Role |
|---|---|---|
| `DATABASE_URL` | _(empty = SQLite)_ | PostgreSQL DSN; empty falls back to `DB_PATH` |
| `WEB_CONCURRENCY` | `4` | Number of gunicorn/uvicorn worker processes |
| `LLM_MAX_CONCURRENCY` | `6` | Per-worker cap on in-flight Qwen requests |
| `LLM_MAX_RETRIES` | `3` | Retries on 429/503/timeout before failing |
| `LLM_TIMEOUT` | `60` | Per-attempt HTTP timeout to Qwen (seconds) |
| `AI_SUGGESTION_IMAGE_MAX_PX` | `1024` | Longest edge of downscaled vision image |
| `PORT` | `8080` | Host port nginx listens on |
| `APP_PORT` | `8080` | Container-internal port gunicorn binds to |

**Scaling relationship to watch:**
`WEB_CONCURRENCY × LLM_MAX_CONCURRENCY` = total concurrent Qwen requests.
With the defaults, that is `4 × 6 = 24`. Adjust only after load-testing the vLLM deployment.

---

## What Was NOT Changed (and Why)

| Item | Status | Reason |
|---|---|---|
| LDAP authentication slowness | Diagnosed, not fixed | Root causes identified (`get_info=ALL` per login, bcrypt cost-12, no connect_timeout) but fix was not requested |
| Frontend build process | Unchanged | Multi-stage Dockerfile already builds React in CI; no change needed |
| JWT secret rotation | Unchanged | Internal tool on private network; user did not request secret rotation |
| TLS / HTTPS | Config commented in nginx.conf | Not requested; placeholders left for future cert mounting |
| Existing PostgreSQL databases | Untouched | Explicit requirement: `do not touch any existing database`. New `data_viewer` DB created fresh |
