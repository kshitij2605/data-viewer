"""Elasticsearch client singleton for connecting to rag_anything indices."""

import logging
from elasticsearch import Elasticsearch
from backend.config import settings

logger = logging.getLogger(__name__)

_es_client: Elasticsearch | None = None

# Cache the resolved aggregatable/term-queryable form of a field per
# (index, field). Mappings don't change at runtime, so this is safe.
_keyword_field_cache: dict[tuple[str, str], str] = {}


def resolve_keyword_field(es: Elasticsearch, index: str, field: str) -> str:
    """Return the exact-match (aggregatable / term-queryable) form of ``field``.

    Indices differ in how they map id-like fields: some map ``parent_doc_id``
    as ``text`` with a ``.keyword`` sub-field (so you must aggregate /
    term-query on ``parent_doc_id.keyword``), while others map it directly as
    ``keyword`` (so ``.keyword`` does not exist and you must use
    ``parent_doc_id`` itself). Using the wrong form silently returns zero
    results. Resolve the right one from the mapping.
    """
    cache_key = (index, field)
    if cache_key in _keyword_field_cache:
        return _keyword_field_cache[cache_key]

    resolved = f"{field}.keyword"  # safe default — preserves legacy behaviour
    try:
        fm = es.indices.get_field_mapping(index=index, fields=field)
        for idx_info in fm.values():
            leaf = idx_info.get("mappings", {}).get(field, {}).get("mapping", {}).get(field, {})
            ftype = leaf.get("type")
            if ftype == "keyword":
                resolved = field
            elif ftype == "text" and "keyword" in leaf.get("fields", {}):
                resolved = f"{field}.keyword"
            break
    except Exception as e:
        logger.warning("Could not resolve keyword field for %s/%s: %s", index, field, e)

    _keyword_field_cache[cache_key] = resolved
    return resolved


def get_es_client() -> Elasticsearch:
    """Get or create a cached Elasticsearch client. Validates URL on first call."""
    global _es_client
    if _es_client is None:
        if not settings.es_url:
            raise RuntimeError("ES_URL is not configured")
        _es_client = Elasticsearch(
            settings.es_url,
            basic_auth=(settings.es_user, settings.es_password),
            verify_certs=settings.es_verify_certs,
            ssl_show_warn=False,
            request_timeout=30,
        )
    return _es_client


def find_es_doc_id(es_index: str, parent_doc_id: str, chunk_index: int) -> str | None:
    """Find the ES _id for a chunk by parent_doc_id and chunk_id fields."""
    es = get_es_client()
    pd_field = resolve_keyword_field(es, es_index, "parent_doc_id")
    resp = es.search(
        index=es_index,
        body={
            "query": {
                "bool": {
                    "filter": [
                        {"term": {pd_field: parent_doc_id}},
                        {"term": {"chunk_id": chunk_index}},
                    ]
                }
            },
            "_source": False,
            "size": 1,
        },
    )
    hits = resp["hits"]["hits"]
    return hits[0]["_id"] if hits else None


def delete_es_chunk(es_index: str, parent_doc_id: str, chunk_index: int) -> bool:
    """Delete a chunk document from ES permanently. Returns True on success."""
    try:
        doc_id = find_es_doc_id(es_index, parent_doc_id, chunk_index)
        if not doc_id:
            logger.warning("ES doc not found for delete: index=%s parent=%s chunk=%d",
                           es_index, parent_doc_id, chunk_index)
            return False
        es = get_es_client()
        es.delete(index=es_index, id=doc_id)
        logger.info("ES chunk deleted: index=%s id=%s", es_index, doc_id)
        return True
    except Exception as e:
        logger.error("Failed to delete ES chunk: %s", e)
        return False


def update_es_chunk(es_index: str, parent_doc_id: str, chunk_index: int,
                    content: str, embedding: list[float] | None = None) -> bool:
    """Update a chunk's content (and optionally embedding) in ES. Returns True on success."""
    try:
        doc_id = find_es_doc_id(es_index, parent_doc_id, chunk_index)
        if not doc_id:
            logger.warning("ES doc not found: index=%s parent=%s chunk=%d",
                           es_index, parent_doc_id, chunk_index)
            return False

        update_body: dict = {"content": content}
        if embedding is not None:
            update_body["embedding"] = embedding

        es = get_es_client()
        es.update(index=es_index, id=doc_id, body={"doc": update_body})
        logger.info("ES chunk updated: index=%s id=%s", es_index, doc_id)
        return True
    except Exception as e:
        logger.error("Failed to update ES chunk: %s", e)
        return False
