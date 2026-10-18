# Deployment Guide

This guide covers everything needed to deploy Data Viewer in production from scratch, including prerequisites, environment configuration, database setup, and day-to-day operations.

---

## Architecture overview

```
Host (veda-host)
  :8082 ──► nginx container (data-viewer-nginx)
                │  proxy cache, gzip, rate limits, SSE passthrough
                ▼
            data-viewer container (app)
                │  gunicorn + WEB_CONCURRENCY uvicorn workers
                │  internal port 8080 (not published to host)
                │
    ┌───────────┼───────────────────────────┐
    ▼           ▼                           ▼
PostgreSQL   MinIO / ES               Qwen / BGE-M3
(postgres-host) (minio-host / elasticsearch-host)   (llm-host / embedding-host)
```

**Port relationship:**
- `PORT` — host-facing port nginx listens on (e.g. `8082`)
- `APP_PORT` — container-internal port gunicorn binds to (always `8080`; never change this)

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker ≥ 24 | With the Compose plugin (`docker compose` not `docker-compose`) |
| Docker Compose v2 | Bundled with Docker Desktop; `apt install docker-compose-plugin` on Linux |
| PostgreSQL ≥ 14 | Any host reachable from the container; a dedicated database is required |
| Outbound TCP | To llm-host:9000, embedding-host:8000, elasticsearch-host:9200, minio-host:9000, LDAP DC:389 |

---

## Step 1 — Clone and configure the environment

```bash
git clone <repo-url> data-viewer-rag-anything
cd data-viewer-rag-anything
cp .env.example .env
```

Edit `.env`. The minimum required values:

```env
# ── Database ──────────────────────────────────────────────────────────────────
# Leave DATABASE_URL empty to fall back to SQLite (not recommended for production)
DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:PORT/data_viewer

# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY=<at-least-32-random-characters>

# ── Networking ────────────────────────────────────────────────────────────────
PORT=8080          # Host port nginx will publish on

# ── Production scaling ────────────────────────────────────────────────────────
WEB_CONCURRENCY=4          # Number of gunicorn workers (≤ available CPU cores)
LLM_MAX_CONCURRENCY=6      # Per-worker Qwen request cap
                            # Total GPU load = WEB_CONCURRENCY × LLM_MAX_CONCURRENCY
LLM_MAX_RETRIES=3
LLM_TIMEOUT=60
AI_SUGGESTION_IMAGE_MAX_PX=1024

# ── Embedding ─────────────────────────────────────────────────────────────────
EMBEDDING_ENDPOINT=http://embedding-host:8000
EMBEDDING_API_KEY=REDACTED
EMBEDDING_MODEL=BAAI/bge-m3

# ── Elasticsearch ─────────────────────────────────────────────────────────────
ES_URL=https://elasticsearch-host:9200
ES_USER=REDACTED
ES_PASSWORD=<password>
ES_VERIFY_CERTS=false

# ── MinIO ─────────────────────────────────────────────────────────────────────
MINIO_ENDPOINT=minio-host:9000
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=rag-anything
MINIO_SECURE=false

# ── LDAP / Active Directory (leave LDAP_URL empty to disable) ─────────────────
LDAP_URL=ldap://ldap-host:389
LDAP_BIND_DN=REDACTED
LDAP_BIND_CREDENTIALS=<password>
LDAP_USER_SEARCH_BASE=DC=example,DC=com
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_STARTTLS=false
LDAP_TLS_REJECT_UNAUTHORIZED=false
LDAP_LOGIN_USES_USERNAME=true
```

> **Security note:** `.env` contains credentials. On a shared server, set permissions: `chmod 600 .env`

---

## Step 2 — Create the PostgreSQL database

Connect to your PostgreSQL server and create a dedicated database. **Do not reuse an existing database.**

```sql
-- Run as a superuser (e.g. postgres)
CREATE DATABASE data_viewer;
```

That is all. Tables are created automatically on first startup by `init_db()`. You do not need to run any migrations manually.

If your PostgreSQL server is on a separate host (e.g. `postgres-host:5433`), test reachability from the application server before proceeding:

```bash
psql postgresql://USER:PASS@postgres-host:5433/data_viewer -c "SELECT 1;"
```

---

## Step 3 — Build and start

```bash
docker compose up -d --build
```

This command:
1. Builds the app image (Node 22 Alpine → React build; Python 3.10 slim → gunicorn)
2. Starts the `data-viewer` container (gunicorn + workers, internal port 8080)
3. Starts the `data-viewer-nginx` container (nginx, host port `${PORT}`)

On first start the app:
- Runs `init_db()` — creates all tables in PostgreSQL
- Runs `seed_users()` — creates `admin/admin`, `reviewer1/reviewer1`, `reviewer2/reviewer2`

Verify the stack is up:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected output:
```
NAMES                  STATUS          PORTS
data-viewer            Up N seconds    8080/tcp
data-viewer-nginx      Up N seconds    0.0.0.0:8080->80/tcp
```

Check the application responds:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT}/
# → 200
```

---

## Step 4 — Verify worker count and database

```bash
# Should show WEB_CONCURRENCY worker processes
docker exec data-viewer sh -c "ps aux | grep gunicorn | grep -v grep | wc -l"

# Should show tables and seeded users in PostgreSQL
docker exec data-viewer python3 -c "
from backend.db import SessionLocal
from backend.models import User
db = SessionLocal()
users = db.query(User).all()
print([u.username for u in users])
db.close()
"
# → ['admin', 'reviewer1', 'reviewer2']
```

---

## Step 5 — (Optional) Enable LDAP / Active Directory

When `LDAP_URL` is set in `.env`:
- All logins go through AD — local accounts (`admin`, etc.) cannot log in
- First-time AD users are auto-provisioned in the DB on their first successful login
- To disable AD and restore local accounts: set `LDAP_URL=` (empty) and restart

To test LDAP connectivity without the full app:

```bash
docker exec -it data-viewer python3 -c "
from backend.services.ldap_auth import authenticate
result = authenticate('YOUR_USERNAME', 'YOUR_PASSWORD')
print(result)
"
```

---

## Redeploying after code changes

```bash
# Rebuild the app image and restart only the app container
# nginx config is read-only mounted — it updates without rebuild
docker compose build data-viewer
docker compose up -d --force-recreate data-viewer
```

> Workers do a graceful restart (30 s drain on existing requests) before the new code takes over.

To update only the nginx config (no rebuild needed):

```bash
# Edit deploy/nginx.conf, then:
docker compose restart nginx
```

---

## Environment variable reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | _(empty = SQLite)_ | Recommended | Full SQLAlchemy DSN for PostgreSQL |
| `DB_PATH` | `data/data_viewer.db` | No | SQLite path (fallback only) |
| `SECRET_KEY` | `REDACTED` | **Yes** | JWT signing key (min 32 chars) |
| `PORT` | `8080` | No | Host port nginx publishes |
| `APP_PORT` | `8080` | No | Container-internal gunicorn bind port — do not change |
| `WEB_CONCURRENCY` | `4` | No | gunicorn worker count |
| `LLM_MAX_CONCURRENCY` | `6` | No | Per-worker Qwen request cap |
| `LLM_MAX_RETRIES` | `3` | No | Retries on 429/503/timeout |
| `LLM_TIMEOUT` | `60` | No | Per-attempt LLM timeout (seconds) |
| `AI_SUGGESTION_IMAGE_MAX_PX` | `1024` | No | Longest edge of downscaled vision image |
| `EMBEDDING_ENDPOINT` | — | **Yes** | BGE-M3 embedding server URL |
| `EMBEDDING_API_KEY` | — | Yes | Embedding server auth key |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | No | Model name |
| `ES_URL` | — | For ES features | Elasticsearch base URL |
| `ES_USER` | `REDACTED` | No | Elasticsearch username |
| `ES_PASSWORD` | — | For ES features | Elasticsearch password |
| `ES_VERIFY_CERTS` | `false` | No | Verify TLS certs on ES connection |
| `MINIO_ENDPOINT` | — | For ES features | MinIO host:port |
| `MINIO_ACCESS_KEY` | — | For ES features | MinIO access key |
| `MINIO_SECRET_KEY` | — | For ES features | MinIO secret key |
| `MINIO_BUCKET` | `rag-anything` | No | MinIO bucket name |
| `MINIO_SECURE` | `false` | No | Use HTTPS for MinIO |
| `LDAP_URL` | _(empty = disabled)_ | No | LDAP server URL; enables AD login when set |
| `LDAP_BIND_DN` | — | If LDAP | Service account DN |
| `LDAP_BIND_CREDENTIALS` | — | If LDAP | Service account password |
| `LDAP_USER_SEARCH_BASE` | — | If LDAP | Base DN for user search |
| `LDAP_SEARCH_FILTER` | `(sAMAccountName={{username}})` | No | User search filter template |
| `LDAP_STARTTLS` | `false` | No | Upgrade to TLS with STARTTLS |
| `LDAP_TLS_REJECT_UNAUTHORIZED` | `false` | No | Reject invalid TLS certs |
| `LDAP_LOGIN_USES_USERNAME` | `true` | No | Use `sAMAccountName` as login username |

---

## Scaling guidance

### Workers vs GPU load

```
WEB_CONCURRENCY × LLM_MAX_CONCURRENCY = max concurrent Qwen requests
```

Do not increase `LLM_MAX_CONCURRENCY` beyond what the vLLM instance can sustain. The Qwen3.5-122B model runs on `llm-host` with `max_model_len=64000`. Each vision call (AI suggestion) is the heaviest request.

| WEB_CONCURRENCY | LLM_MAX_CONCURRENCY | Total GPU requests | Suitable for |
|---|---|---|---|
| 2 | 4 | 8 | Light use, shared server |
| 4 | 6 | 24 | Current production setting |
| 4 | 12 | 48 | Dedicated GPU available |
| 8 | 6 | 48 | More CPU workers, same GPU budget |

### Memory

Each gunicorn worker uses roughly 300–500 MB RSS at idle, rising to ~1 GB during large document chunking (PyMuPDF thumbnail generation). The compose limit is `8g`. Adjust in `docker-compose.yml` under `deploy.resources.limits.memory`.

### PostgreSQL connections

Each worker holds a connection pool of `pool_size=5` with `max_overflow=10`, so `WEB_CONCURRENCY × 15` max connections. At 4 workers that is 60. A standard PostgreSQL instance (`max_connections=100`) handles this comfortably.

---

## Operations

### View logs

```bash
docker logs data-viewer -f           # app (gunicorn access + error log)
docker logs data-viewer-nginx -f     # proxy (request log)
```

### Restart without downtime

```bash
docker compose up -d --force-recreate data-viewer
# Gunicorn does a graceful_timeout=30s drain before stopping old workers
```

### Stop and start

```bash
docker compose down       # stop both containers (data is in PostgreSQL, persists)
docker compose up -d      # start without rebuilding
```

### Check container resource usage

```bash
docker stats data-viewer data-viewer-nginx --no-stream
```

### Run tests

```bash
# From the repo root (outside Docker, requires Python 3.10 + deps installed)
pytest tests/ -v

# Or inside the running container
docker exec data-viewer pytest tests/ -v
```

---

## Troubleshooting

### 502 Bad Gateway from nginx

nginx cannot reach the app container. Check:
1. `docker ps` — is `data-viewer` running?
2. `docker logs data-viewer` — did gunicorn start cleanly?
3. `APP_PORT` in `.env` — must match the `server data-viewer:8080` line in `nginx.conf`. Default is `8080`; do not set `APP_PORT=8082` or any value that differs.

### Database locked / OperationalError (SQLite only)

Only occurs when using SQLite with multiple workers. Solution: set `DATABASE_URL` to a PostgreSQL DSN and restart.

### Login fails for AD users

1. Check `LDAP_URL` is reachable: `telnet ldap-host 389`
2. Test from inside the container (see Step 5 above)
3. Check `docker logs data-viewer` for `LDAP service bind failed` or `LDAP search returned no entries`

### LLM evaluation returns empty scores

Check `docker logs data-viewer` for:
- `LLM call failed (attempt N/N)` — GPU endpoint unreachable or returning errors
- `Could not parse LLM scores` — the model returned an unexpected format

Increase `LLM_MAX_RETRIES` or `LLM_TIMEOUT` if the GPU is consistently slow. Reduce `LLM_MAX_CONCURRENCY` if you see sustained 429 responses.

### Workers recycling too frequently

Gunicorn recycles workers every `max_requests=2000` requests (with `±200` jitter) to bound memory growth. If workers are dying before that, check `docker logs data-viewer` for `[CRITICAL] WORKER TIMEOUT`. Increase `GUNICORN_TIMEOUT` in `.env` (default `120` seconds) for large chunking jobs.

---

## Upgrading

```bash
git pull origin main
docker compose build data-viewer
docker compose up -d --force-recreate data-viewer
```

Schema migrations run automatically on startup via `init_db()`. New columns are added with `ALTER TABLE … ADD COLUMN` (idempotent — safe to run on an existing database).

> **Never drop the `data_viewer` database** before upgrading. The migration is additive only.

---

## Backup

The application's persistent state is in PostgreSQL. Back up with standard pg_dump:

```bash
pg_dump postgresql://USER:PASS@postgres-host:5433/data_viewer \
  -F c -f "data_viewer_$(date +%Y%m%d).pgdump"
```

The `./data` volume contains page thumbnails (regenerable from MinIO) and the SQLite fallback file. These are not critical if PostgreSQL is the active database.
