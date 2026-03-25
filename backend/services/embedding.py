"""Embedding service — calls BGE-M3 endpoint for vector embeddings."""
import httpx
from backend.config import settings


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Call BGE-M3 endpoint. Returns list of embedding vectors."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.embedding_endpoint}/v1/embeddings",
            json={"input": texts, "model": settings.embedding_model},
            headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]


def get_embedding_sync(text: str) -> list[float]:
    """Synchronous single-text embedding for use in chunking."""
    response = httpx.post(
        f"{settings.embedding_endpoint}/v1/embeddings",
        json={"input": [text], "model": settings.embedding_model},
        headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
        timeout=60.0,
    )
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]
