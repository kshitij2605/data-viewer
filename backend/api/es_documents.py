"""Elasticsearch document discovery and import endpoints."""

import asyncio
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db, SessionLocal
from backend.models import Document, Chunk, ChunkImage, User
from backend.services.es_client import get_es_client
from backend.services.minio_client import fetch_minio_bytes, minio_object_exists

logger = logging.getLogger(__name__)

# Known strategy keywords in index names (order matters — check longer first)
_INDEX_STRATEGY_KEYWORDS = [
    ("page-markdown", "page_markdown"),
    ("markdown", "markdown"),
    ("semantic", "semantic"),
    ("recursive", "recursive"),
    ("character", "character"),
    ("page", "page"),
]


def _strategy_from_index(index_name: str) -> str | None:
    """Infer chunking strategy from index name as a fallback."""
    lower = index_name.lower()
    for keyword, strategy in _INDEX_STRATEGY_KEYWORDS:
        if keyword in lower:
            return strategy
    return None

router = APIRouter(prefix="/api/es", tags=["elasticsearch"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ESIndex(BaseModel):
    index_name: str
    doc_count: int


class ESDocument(BaseModel):
    parent_doc_id: str
    filename: str
    chunk_count: int
    num_pages: int
    index_name: str
    already_imported: bool = False


class ImportResult(BaseModel):
    id: int
    folder_name: str
    pdf_title: Optional[str] = None
    num_pages: int
    num_images: int
    num_tables: int
    chunks_imported: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# GET /api/es/indices — list available ES indices
# ---------------------------------------------------------------------------

@router.get("/indices", response_model=list[ESIndex])
def list_indices(current_user: User = Depends(get_current_user)):
    es = get_es_client()
    try:
        stats = es.cat.indices(format="json")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Elasticsearch error: {e}")

    results = []
    for idx in stats:
        name = idx.get("index", "")
        if not name.startswith("rag-anything-glmhybridocr-"):
            continue
        results.append(ESIndex(
            index_name=name,
            doc_count=int(idx.get("docs.count", 0)),
        ))
    results.sort(key=lambda x: x.index_name)
    return results


# ---------------------------------------------------------------------------
# GET /api/es/documents — list unique documents in an index
# ---------------------------------------------------------------------------

@router.get("/documents", response_model=list[ESDocument])
def list_es_documents(
    index: str = Query(..., description="ES index name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    es = get_es_client()

    # Aggregate on parent_doc_id to get unique documents
    body = {
        "size": 0,
        "aggs": {
            "docs": {
                "terms": {
                    "field": "parent_doc_id.keyword",
                    "size": 10000,
                },
                "aggs": {
                    "sample": {
                        "top_hits": {
                            "size": 1,
                            "_source": [
                                "metadata.filename",
                                "metadata.minio_metadata",
                                "page_number",
                            ],
                        }
                    },
                    "max_page": {"max": {"field": "page_number"}},
                },
            }
        },
    }

    try:
        resp = es.search(index=index, body=body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Elasticsearch error: {e}")

    # Build set of already-imported (es_index, es_parent_doc_id) pairs
    imported = set()
    existing = (
        db.query(Document.es_index, Document.es_parent_doc_id)
        .filter(Document.source_type == "elasticsearch")
        .all()
    )
    for row in existing:
        imported.add((row[0], row[1]))

    results = []
    for bucket in resp["aggregations"]["docs"]["buckets"]:
        parent_doc_id = bucket["key"]
        chunk_count = bucket["doc_count"]
        hit = bucket["sample"]["hits"]["hits"][0]["_source"]
        filename = hit.get("metadata", {}).get("filename", parent_doc_id)
        max_page = int(bucket["max_page"]["value"] or 1)

        results.append(ESDocument(
            parent_doc_id=parent_doc_id,
            filename=filename,
            chunk_count=chunk_count,
            num_pages=max_page,
            index_name=index,
            already_imported=(index, parent_doc_id) in imported,
        ))

    results.sort(key=lambda x: x.filename)
    return results


# ---------------------------------------------------------------------------
# POST /api/es/documents/{parent_doc_id}/import — import ES doc into SQLite
# ---------------------------------------------------------------------------

@router.post("/documents/{parent_doc_id}/import", response_model=ImportResult)
async def import_es_document(
    parent_doc_id: str,
    index: str = Query(..., description="ES index name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if already imported
    existing = (
        db.query(Document)
        .filter(Document.es_index == index, Document.es_parent_doc_id == parent_doc_id)
        .first()
    )
    if existing:
        chunk_count = db.query(Chunk).filter(Chunk.document_id == existing.id).count()
        return ImportResult(
            id=existing.id,
            folder_name=existing.folder_name,
            pdf_title=existing.pdf_title,
            num_pages=existing.num_pages,
            num_images=existing.num_images,
            num_tables=existing.num_tables,
            chunks_imported=chunk_count,
        )

    # Fetch all chunks from ES
    es = get_es_client()
    chunks_data = _fetch_all_chunks(es, index, parent_doc_id)

    if not chunks_data:
        raise HTTPException(status_code=404, detail="No chunks found for this document in ES")

    # Extract document-level metadata from first chunk
    first_source = chunks_data[0]["_source"]
    metadata = first_source.get("metadata", {})
    minio_meta = metadata.get("minio_metadata", {})
    filename = metadata.get("filename", parent_doc_id)
    # Index name is more reliable than metadata field (metadata often has wrong "page" value)
    es_chunking_strategy = (
        _strategy_from_index(index)
        or metadata.get("chunking_strategy")
    )
    es_chunk_size = metadata.get("chunk_size", None)
    es_chunk_overlap = metadata.get("chunk_overlap", None)

    # Derive minio_prefix from minio paths
    minio_prefix = _derive_minio_prefix(minio_meta, index, filename)

    # Try to get num_images/num_tables from parsing_metrics in MinIO
    num_images = 0
    num_tables = 0
    pdf_title = filename
    num_pages = max((c["_source"].get("page_number", 1) for c in chunks_data), default=1)

    metrics_path = minio_meta.get("parsing_metrics_path")
    if not metrics_path and minio_prefix:
        metrics_path = f"{minio_prefix}/metadata/parsing_metrics.json"

    if metrics_path:
        try:
            metrics_bytes = fetch_minio_bytes(metrics_path)
            metrics = json.loads(metrics_bytes)
            pdf_title = metrics.get("pdf_title", filename)
            num_images_data = metrics.get("num_images", 0)
            num_images = num_images_data.get("total", 0) if isinstance(num_images_data, dict) else int(num_images_data)
            num_tables = metrics.get("num_tables", 0)
        except Exception as e:
            logger.warning("Could not fetch parsing_metrics from MinIO: %s", e)

    # Count unique images/tables from chunk minio_metadata as fallback
    if num_images == 0:
        all_image_paths = set()
        for c in chunks_data:
            paths = c["_source"].get("metadata", {}).get("minio_metadata", {}).get("image_paths", [])
            all_image_paths.update(paths)
        num_images = len(all_image_paths)

    if num_tables == 0:
        all_table_paths = set()
        for c in chunks_data:
            paths = c["_source"].get("metadata", {}).get("minio_metadata", {}).get("table_paths", [])
            all_table_paths.update(paths)
        num_tables = len(all_table_paths)

    # Create Document
    doc = Document(
        folder_name=filename.replace(".pdf", "") if filename.endswith(".pdf") else filename,
        folder_path=f"es://{index}/{parent_doc_id}",
        pdf_title=pdf_title,
        num_pages=num_pages,
        num_images=num_images,
        num_tables=num_tables,
        source_type="elasticsearch",
        es_index=index,
        es_parent_doc_id=parent_doc_id,
        minio_prefix=minio_prefix,
        layout_pdf_path=minio_meta.get("layout_pdf_path"),
        chunking_strategy=es_chunking_strategy,
        loaded_by_user_id=current_user.id,
    )
    db.add(doc)
    db.flush()  # get doc.id

    # Create Chunk rows
    chunking_strategy = metadata.get("chunking_strategy") or _strategy_from_index(index) or "unknown"
    for chunk_hit in chunks_data:
        src = chunk_hit["_source"]
        chunk_minio = src.get("metadata", {}).get("minio_metadata", {})

        chunk = Chunk(
            document_id=doc.id,
            chunk_index=src.get("chunk_id", 0),
            page_number=src.get("page_number", 1),
            content=src.get("content", ""),
            chunking_strategy=chunking_strategy,
        )
        db.add(chunk)
        db.flush()

        # Create ChunkImage rows from minio_metadata.image_paths
        for img_path in chunk_minio.get("image_paths", []):
            image_name = img_path.rsplit("/", 1)[-1] if "/" in img_path else img_path
            page_index = _parse_page_from_image_name(image_name)
            db.add(ChunkImage(
                chunk_id=chunk.id,
                image_name=image_name,
                page_index=page_index,
            ))

    db.commit()
    db.refresh(doc)

    # Trigger AI review in background
    _launch_ai_review_for_es_doc(doc.id, minio_prefix, num_pages, num_images, num_tables, pdf_title)

    return ImportResult(
        id=doc.id,
        folder_name=doc.folder_name,
        pdf_title=doc.pdf_title,
        num_pages=doc.num_pages,
        num_images=doc.num_images,
        num_tables=doc.num_tables,
        chunks_imported=len(chunks_data),
    )


# ---------------------------------------------------------------------------
# POST /api/es/documents/{document_id}/refresh — re-import from ES
# ---------------------------------------------------------------------------

@router.post("/documents/{document_id}/refresh")
def refresh_from_es(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or doc.source_type != "elasticsearch":
        raise HTTPException(status_code=404, detail="ES document not found")

    es = get_es_client()
    chunks_data = _fetch_all_chunks(es, doc.es_index, doc.es_parent_doc_id)
    if not chunks_data:
        raise HTTPException(status_code=404, detail="No chunks found in ES")

    # Delete old chunks (CASCADE removes edits, feedback, images)
    db.query(Chunk).filter(Chunk.document_id == doc.id).delete()

    metadata = chunks_data[0]["_source"].get("metadata", {})
    chunking_strategy = _strategy_from_index(doc.es_index or "") or metadata.get("chunking_strategy") or "unknown"
    doc.chunking_strategy = chunking_strategy

    for chunk_hit in chunks_data:
        src = chunk_hit["_source"]
        chunk_minio = src.get("metadata", {}).get("minio_metadata", {})

        chunk = Chunk(
            document_id=doc.id,
            chunk_index=src.get("chunk_id", 0),
            page_number=src.get("page_number", 1),
            content=src.get("content", ""),
            chunking_strategy=chunking_strategy,
        )
        db.add(chunk)
        db.flush()

        for img_path in chunk_minio.get("image_paths", []):
            image_name = img_path.rsplit("/", 1)[-1] if "/" in img_path else img_path
            page_index = _parse_page_from_image_name(image_name)
            db.add(ChunkImage(
                chunk_id=chunk.id,
                image_name=image_name,
                page_index=page_index,
            ))

    doc.num_pages = max((c["_source"].get("page_number", 1) for c in chunks_data), default=1)
    db.commit()

    return {"status": "refreshed", "chunks_imported": len(chunks_data)}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fetch_all_chunks(es, index: str, parent_doc_id: str) -> list:
    """Fetch all chunks for a document from ES using search_after."""
    all_hits = []
    body = {
        "query": {"term": {"parent_doc_id.keyword": parent_doc_id}},
        "sort": [{"chunk_id": "asc"}],
        "size": 500,
    }

    try:
        resp = es.search(index=index, body=body)
        hits = resp["hits"]["hits"]
        all_hits.extend(hits)

        while len(hits) == 500:
            body["search_after"] = hits[-1]["sort"]
            resp = es.search(index=index, body=body)
            hits = resp["hits"]["hits"]
            all_hits.extend(hits)

    except Exception as e:
        logger.error("Error fetching chunks from ES: %s", e)

    return all_hits


def _derive_minio_prefix(minio_meta: dict, index: str, filename: str) -> str:
    """Derive the MinIO prefix (index/pdf_name) from chunk minio_metadata."""
    # Try to extract from known paths
    for key in ("markdown_path", "parsing_metrics_path", "page_thumbnail_path"):
        path = minio_meta.get(key, "")
        if path and "/" in path:
            # e.g. "index_name/pdf_name/markdown/file.mmd" -> "index_name/pdf_name"
            parts = path.split("/")
            if len(parts) >= 2:
                return f"{parts[0]}/{parts[1]}"

    # Try from image_paths
    for img_path in minio_meta.get("image_paths", []):
        if "/" in img_path:
            parts = img_path.split("/")
            if len(parts) >= 2:
                return f"{parts[0]}/{parts[1]}"

    # Fallback: construct from index + filename
    pdf_name = filename.replace(".pdf", "") if filename.endswith(".pdf") else filename
    return f"{index}/{pdf_name}"


def _parse_page_from_image_name(name: str) -> int:
    """Extract page number from image filename like 'pdf_name_3_0.jpg' or '3_0.jpg'."""
    # Try pattern: digits_digits.ext (the first group is page)
    m = re.search(r"(\d+)_\d+\.\w+$", name)
    if m:
        return int(m.group(1))
    return 0


def _launch_ai_review_for_es_doc(
    doc_id: int, minio_prefix: str,
    num_pages: int, num_images: int, num_tables: int, doc_title: str,
):
    """Launch background AI review for an ES-imported document."""
    async def _run():
        from backend.services.llm_eval import evaluate_chunking_strategy
        from backend.services.minio_client import fetch_minio_text

        bg_db = SessionLocal()
        try:
            doc = bg_db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                return

            # Find markdown in MinIO
            markdown_content = None
            if minio_prefix:
                # Try known path pattern
                pdf_name = minio_prefix.split("/")[-1] if "/" in minio_prefix else minio_prefix
                md_path = f"{minio_prefix}/markdown/{pdf_name}_with_captions.mmd"
                try:
                    markdown_content = fetch_minio_text(md_path)
                except Exception as e:
                    logger.warning("Could not fetch markdown from MinIO (%s): %s", md_path, e)

            if not markdown_content:
                doc.ai_review_status = "error"
                doc.ai_review = "MinIOからMarkdownファイルを取得できません"
                bg_db.commit()
                return

            doc.ai_review_status = "running"
            bg_db.commit()

            review = await evaluate_chunking_strategy(
                markdown_content, num_pages, num_images, num_tables, doc_title=doc_title
            )

            doc.ai_review = review
            doc.ai_review_status = "done"
            bg_db.commit()
        except Exception as e:
            logger.error("AI review failed for ES doc %d: %s", doc_id, e)
            try:
                doc = bg_db.query(Document).filter(Document.id == doc_id).first()
                if doc:
                    doc.ai_review_status = "error"
                    doc.ai_review = f"エラー: {str(e)[:200]}"
                    bg_db.commit()
            except Exception:
                pass
        finally:
            bg_db.close()

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run())
    except RuntimeError:
        pass
