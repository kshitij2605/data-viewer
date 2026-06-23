"""Veda vector database (project-mdb) REST client.

Veda exposes an HTTP REST API (default port 6340) for collections and records.
We talk to it with httpx — mirroring how ``es_client`` wraps elasticsearch-py —
so importing a Veda document works just like importing an Elasticsearch one.

The REST API returns record field values as plain JSON (``field_value_to_json``
on the server unwraps ``{"Int64": 5}`` to ``5`` and ``{"String": "x"}`` to
``"x"``), so callers read ``record["fields"][name]`` directly.
"""
import logging
from typing import Iterator, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.Client] = None


def get_veda_client() -> httpx.Client:
    """Get or create a cached httpx client bound to the Veda base URL."""
    global _client
    if _client is None:
        if not settings.veda_url:
            raise RuntimeError("VEDA_URL is not configured")
        headers = {"Content-Type": "application/json"}
        if settings.veda_token:
            headers["Authorization"] = f"Bearer {settings.veda_token}"
        # trust_env=False: Veda is an internal/localhost service, so bypass any
        # HTTP(S)_PROXY in the environment — a corporate proxy would otherwise
        # hijack the localhost request and fail it.
        _client = httpx.Client(
            base_url=settings.veda_url.rstrip("/"),
            headers=headers,
            timeout=30.0,
            trust_env=False,
        )
    return _client


def _get(path: str, params: dict | None = None) -> dict:
    client = get_veda_client()
    resp = client.get(path, params=params)
    resp.raise_for_status()
    return resp.json()


def list_collections() -> list[dict]:
    """Return the collection summaries: [{name, field_count, shard_count}, ...]."""
    data = _get("/v1/collections")
    return data.get("collections", [])


def collection_count(collection: str) -> int:
    """Total (non-deleted) record count in a collection."""
    data = _get(f"/v1/collections/{collection}/records", params={"limit": 1, "offset": 0})
    return int(data.get("total", 0))


def iter_records(collection: str, page_size: int = 500) -> Iterator[dict]:
    """Yield every record ``{"id": ..., "fields": {...}}`` in a collection,
    paginating the list-records endpoint.

    Veda's list endpoint has no server-side field projection or filter, so each
    record carries all of its fields (including any embedding vector); callers
    read only the scalar fields they need and ignore the rest. For very large
    collections this transfers a lot of data — acceptable for the document-scale
    collections this tool targets.
    """
    offset = 0
    while True:
        data = _get(
            f"/v1/collections/{collection}/records",
            params={"limit": page_size, "offset": offset},
        )
        records = data.get("records", [])
        if not records:
            break
        for rec in records:
            yield rec
        offset += len(records)
        if offset >= int(data.get("total", 0)):
            break
