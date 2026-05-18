"""Elasticsearch client singleton for connecting to rag_anything indices."""

import logging
from elasticsearch import Elasticsearch
from backend.config import settings

logger = logging.getLogger(__name__)

_es_client: Elasticsearch | None = None


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
    resp = es.search(
        index=es_index,
        body={
            "query": {
                "bool": {
                    "filter": [
                        {"term": {"parent_doc_id.keyword": parent_doc_id}},
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
