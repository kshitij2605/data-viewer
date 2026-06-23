"""Veda vector database document discovery and import endpoints.

Mirrors ``es_documents`` for the Veda (project-mdb) source. Veda collections are
the equivalent of Elasticsearch indices; records grouped by ``parent_doc_id``
are the equivalent of documents. Veda stores text chunks (no MinIO assets), so
imported documents are text/markdown only: the full markdown is reconstructed
from the chunk contents at import time and stored on the Document row.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Document, Chunk, User
from backend.services import veda_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/veda", tags=["veda"])

# Record field names in the rag_anything Veda schema. Centralised so a
# differently-named collection can be supported by adjusting these.
_FIELD_PARENT = "parent_doc_id"
_FIELD_CHUNK_ID = "chunk_id"
_FIELD_PAGE = "page_number"
_FIELD_CONTENT = "content"
_FIELD_FILENAME = "filename"  # optional; falls back to parent_doc_id


# ---------------------------------------------------------------------------
# Response models (shapes match the ES models so the frontend can reuse them;
# `index_name` carries the Veda collection name).
# ---------------------------------------------------------------------------

class VedaCollection(BaseModel):
    index_name: str
    doc_count: int


class VedaDocument(BaseModel):
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
# Helpers
# ---------------------------------------------------------------------------

def _field(rec: dict, key: str, default=None):
    return rec.get("fields", {}).get(key, default)


def _safe_int(val, default: int) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _page_of(rec: dict) -> int:
    return _safe_int(_field(rec, _FIELD_PAGE, 1), 1)


def _chunk_index_of(rec: dict) -> int:
    return _safe_int(_field(rec, _FIELD_CHUNK_ID, 0), 0)


def _fetch_doc_records(collection: str, parent_doc_id: str) -> list[dict]:
    """All records for one document, sorted by chunk id.

    Veda has no server-side filter on the list endpoint, so this scans the
    collection and filters client-side by parent_doc_id.
    """
    recs = [
        r for r in veda_client.iter_records(collection)
        if str(_field(r, _FIELD_PARENT)) == parent_doc_id
    ]
    recs.sort(key=_chunk_index_of)
    return recs


def _reconstruct_markdown(records: list[dict]) -> str:
    """Rebuild page-wise markdown from a document's chunks: chunks joined within
    a page, pages joined by the ``---`` delimiter the viewer splits on."""
    pages: dict[int, list[str]] = {}
    for rec in records:
        page = _page_of(rec)
        content = _field(rec, _FIELD_CONTENT, "") or ""
        pages.setdefault(page, []).append(str(content))
    return "\n\n---\n\n".join(
        "\n\n".join(pages[p]) for p in sorted(pages)
    )


def _store_chunks(db: Session, doc: Document, records: list[dict]) -> None:
    for rec in records:
        db.add(Chunk(
            document_id=doc.id,
            chunk_index=_chunk_index_of(rec),
            page_number=_page_of(rec),
            content=str(_field(rec, _FIELD_CONTENT, "") or ""),
            chunking_strategy="unknown",
        ))


# ---------------------------------------------------------------------------
# GET /api/veda/collections — list available Veda collections
# ---------------------------------------------------------------------------

@router.get("/collections", response_model=list[VedaCollection])
def list_collections(current_user: User = Depends(get_current_user)):
    try:
        cols = veda_client.list_collections()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Veda error: {e}")

    results = []
    for c in cols:
        name = c.get("name", "")
        if not name:
            continue
        try:
            count = veda_client.collection_count(name)
        except Exception:
            count = 0
        results.append(VedaCollection(index_name=name, doc_count=count))
    results.sort(key=lambda x: x.index_name)
    return results


# ---------------------------------------------------------------------------
# GET /api/veda/documents — list unique documents in a collection
# ---------------------------------------------------------------------------

@router.get("/documents", response_model=list[VedaDocument])
def list_veda_documents(
    collection: str = Query(..., description="Veda collection name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        records = veda_client.iter_records(collection)
        groups: dict[str, dict] = {}
        for rec in records:
            pid = _field(rec, _FIELD_PARENT)
            if pid is None:
                continue
            pid = str(pid)
            g = groups.setdefault(pid, {"chunks": 0, "max_page": 1, "filename": None})
            g["chunks"] += 1
            g["max_page"] = max(g["max_page"], _page_of(rec))
            if g["filename"] is None:
                g["filename"] = _field(rec, _FIELD_FILENAME) or pid
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Veda error: {e}")

    imported = set()
    existing = (
        db.query(Document.veda_collection, Document.veda_doc_id)
        .filter(Document.source_type == "veda")
        .all()
    )
    for row in existing:
        imported.add((row[0], row[1]))

    results = [
        VedaDocument(
            parent_doc_id=pid,
            filename=str(g["filename"] or pid),
            chunk_count=g["chunks"],
            num_pages=g["max_page"],
            index_name=collection,
            already_imported=(collection, pid) in imported,
        )
        for pid, g in groups.items()
    ]
    results.sort(key=lambda x: x.filename)
    return results


# ---------------------------------------------------------------------------
# POST /api/veda/documents/{parent_doc_id}/import — import into SQLite
# ---------------------------------------------------------------------------

@router.post("/documents/{parent_doc_id}/import", response_model=ImportResult)
async def import_veda_document(
    parent_doc_id: str,
    collection: str = Query(..., description="Veda collection name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(Document)
        .filter(Document.veda_collection == collection, Document.veda_doc_id == parent_doc_id)
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

    try:
        records = _fetch_doc_records(collection, parent_doc_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Veda error: {e}")

    if not records:
        raise HTTPException(status_code=404, detail="No chunks found for this document in Veda")

    filename = str(_field(records[0], _FIELD_FILENAME) or parent_doc_id)
    folder_name = filename[:-4] if filename.endswith(".pdf") else filename
    num_pages = max((_page_of(r) for r in records), default=1)

    doc = Document(
        folder_name=folder_name,
        folder_path=f"veda://{collection}/{parent_doc_id}",
        pdf_title=filename,
        num_pages=num_pages,
        num_images=0,
        num_tables=0,
        source_type="veda",
        veda_collection=collection,
        veda_doc_id=parent_doc_id,
        source_markdown=_reconstruct_markdown(records),
        loaded_by_user_id=current_user.id,
    )
    db.add(doc)
    db.flush()  # get doc.id

    _store_chunks(db, doc, records)
    db.commit()
    db.refresh(doc)

    # Trigger background AI review (reads doc.source_markdown).
    from backend.api.documents import _launch_ai_review
    _launch_ai_review(doc.id, doc.folder_path, num_pages, 0, 0)

    return ImportResult(
        id=doc.id,
        folder_name=doc.folder_name,
        pdf_title=doc.pdf_title,
        num_pages=doc.num_pages,
        num_images=0,
        num_tables=0,
        chunks_imported=len(records),
    )


# ---------------------------------------------------------------------------
# POST /api/veda/documents/{document_id}/refresh — re-import from Veda
# ---------------------------------------------------------------------------

@router.post("/documents/{document_id}/refresh")
def refresh_from_veda(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or doc.source_type != "veda":
        raise HTTPException(status_code=404, detail="Veda document not found")

    try:
        records = _fetch_doc_records(doc.veda_collection, doc.veda_doc_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Veda error: {e}")
    if not records:
        raise HTTPException(status_code=404, detail="No chunks found in Veda")

    # Delete old chunks (CASCADE removes edits, feedback, images)
    db.query(Chunk).filter(Chunk.document_id == doc.id).delete()

    _store_chunks(db, doc, records)
    doc.source_markdown = _reconstruct_markdown(records)
    doc.num_pages = max((_page_of(r) for r in records), default=1)
    db.commit()

    return {"status": "refreshed", "chunks_imported": len(records)}
