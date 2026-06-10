"""Gunicorn configuration for production.

Runs the FastAPI app under multiple Uvicorn workers so the platform can serve
many concurrent users instead of a single event loop. Worker count is set via
WEB_CONCURRENCY (default 4). Each worker is an independent process with its own
DB connection pool and its own global LLM concurrency semaphore — size
LLM_MAX_CONCURRENCY so that (workers × LLM_MAX_CONCURRENCY) stays within what the
shared Qwen deployment can sustain.
"""
import os

# Internal container bind. Always 8080 (matches Dockerfile EXPOSE and the nginx
# upstream). PORT is reserved for the host-facing nginx port, not this bind.
bind = f"0.0.0.0:{os.getenv('APP_PORT', '8080')}"
workers = int(os.getenv("WEB_CONCURRENCY", "4"))
worker_class = "uvicorn.workers.UvicornWorker"

# Async workers heartbeat to the master, so long-lived SSE streams are not
# killed by this timeout; it only bounds genuinely stuck workers.
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically to bound memory growth.
max_requests = 2000
max_requests_jitter = 200

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
