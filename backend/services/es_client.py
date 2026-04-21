"""Elasticsearch client singleton for connecting to rag_anything indices."""

from elasticsearch import Elasticsearch
from backend.config import settings

_es_client: Elasticsearch | None = None


def get_es_client() -> Elasticsearch:
    """Get or create a cached Elasticsearch client."""
    global _es_client
    if _es_client is None:
        _es_client = Elasticsearch(
            settings.es_url,
            basic_auth=(settings.es_user, settings.es_password),
            verify_certs=settings.es_verify_certs,
            ssl_show_warn=False,
            request_timeout=30,
        )
    return _es_client
