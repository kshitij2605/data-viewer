"""File serving endpoints for documents (local filesystem or MinIO)."""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Document, User
from backend.services.pdf_thumbnails import get_thumbnail_path

router = APIRouter(prefix="/api/documents", tags=["files"])


def _get_doc(document_id: int, db: Session) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _is_minio(doc: Document) -> bool:
    return doc.source_type == "elasticsearch"


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------

def _get_full_markdown(doc: Document) -> str:
    """Get full markdown content from local FS or MinIO."""
    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_text
        prefix = doc.minio_prefix
        pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
        md_path = f"{prefix}/markdown/{pdf_name}_with_captions.mmd"
        try:
            return fetch_minio_text(md_path)
        except Exception:
            raise HTTPException(status_code=404, detail="Markdown file not found in MinIO")
    else:
        work_dir = Path(doc.folder_path)
        mmd_files = list(work_dir.glob("*_with_captions.mmd"))
        if not mmd_files:
            raise HTTPException(status_code=404, detail="Markdown file not found")
        return mmd_files[0].read_text(encoding="utf-8")


@router.get("/{document_id}/markdown")
def get_markdown(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)
    content = _get_full_markdown(doc)
    return PlainTextResponse(content)


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

@router.get("/{document_id}/images/{name}")
def get_image(
    document_id: int,
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)

    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        # Try direct name first, then with pdf_name prefix
        for candidate in [f"{prefix}/images/{name}", f"{prefix}/images/{_prefixed_name(prefix, name)}"]:
            try:
                data = fetch_minio_bytes(candidate)
                media = "image/png" if name.endswith(".png") else "image/jpeg"
                return Response(content=data, media_type=media)
            except Exception:
                continue
        raise HTTPException(status_code=404, detail="Image not found in MinIO")

    image_path = Path(doc.folder_path) / "images" / name
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(image_path), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

@router.get("/{document_id}/tables/{name}")
def get_table_image(
    document_id: int,
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)

    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        for candidate in [f"{prefix}/tables/{name}", f"{prefix}/tables/{_prefixed_name(prefix, name)}"]:
            try:
                data = fetch_minio_bytes(candidate)
                media = "image/png" if name.endswith(".png") else "image/jpeg"
                return Response(content=data, media_type=media)
            except Exception:
                continue
        raise HTTPException(status_code=404, detail="Table image not found in MinIO")

    table_path = Path(doc.folder_path) / "tables" / name
    if not table_path.exists():
        raise HTTPException(status_code=404, detail="Table image not found")
    return FileResponse(str(table_path), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Layout PDF
# ---------------------------------------------------------------------------

@router.get("/{document_id}/layout-pdf")
def get_layout_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)

    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
        layout_path = f"{prefix}/layout/{pdf_name}_layouts.pdf"
        try:
            data = fetch_minio_bytes(layout_path)
            return Response(content=data, media_type="application/pdf")
        except Exception:
            raise HTTPException(status_code=404, detail="Layout PDF not found in MinIO")

    work_dir = Path(doc.folder_path)
    pdf_files = list(work_dir.glob("*_layouts.pdf"))
    if not pdf_files:
        raise HTTPException(status_code=404, detail="Layout PDF not found")
    return FileResponse(str(pdf_files[0]), media_type="application/pdf")


# ---------------------------------------------------------------------------
# Page markdown
# ---------------------------------------------------------------------------

@router.get("/{document_id}/page/{page_num}/markdown")
def get_page_markdown(
    document_id: int,
    page_num: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the markdown content for a specific page (1-indexed)."""
    doc = _get_doc(document_id, db)
    content = _get_full_markdown(doc)
    pages = re.split(r"\n---\s*\n?", content)
    pages = [p.strip() for p in pages if p.strip()]
    idx = page_num - 1
    if idx < 0 or idx >= len(pages):
        raise HTTPException(status_code=404, detail="Page not found")
    return {"content": pages[idx]}


# ---------------------------------------------------------------------------
# Page thumbnail
# ---------------------------------------------------------------------------

@router.get("/{document_id}/page/{page_num}/thumbnail")
def get_page_thumbnail(
    document_id: int,
    page_num: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)

    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
        # Try the naming pattern used by rag_anything: {pdf_name}_{page_num}.png
        for candidate in [
            f"{prefix}/pages/{pdf_name}_{page_num}.png",
            f"{prefix}/pages/page_{page_num}.png",
        ]:
            try:
                data = fetch_minio_bytes(candidate)
                return Response(content=data, media_type="image/png")
            except Exception:
                continue
        raise HTTPException(status_code=404, detail="Thumbnail not found in MinIO")

    _get_doc(document_id, db)  # validate existence
    thumb_path = get_thumbnail_path(document_id, page_num)
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _prefixed_name(minio_prefix: str, name: str) -> str:
    """Add pdf_name prefix to an image name if not already present.

    MinIO stores images as '{pdf_name}_{page}_{idx}.jpg' while the markdown
    references them as '{page}_{idx}.jpg'.
    """
    pdf_name = minio_prefix.split("/")[-1] if "/" in minio_prefix else minio_prefix
    if name.startswith(f"{pdf_name}_"):
        return name
    return f"{pdf_name}_{name}"
