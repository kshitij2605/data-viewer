"""File serving endpoints for documents."""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
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


@router.get("/{document_id}/markdown")
def get_markdown(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)
    work_dir = Path(doc.folder_path)
    mmd_files = list(work_dir.glob("*_with_captions.mmd"))
    if not mmd_files:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    content = mmd_files[0].read_text(encoding="utf-8")
    return PlainTextResponse(content)


@router.get("/{document_id}/images/{name}")
def get_image(
    document_id: int,
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)
    image_path = Path(doc.folder_path) / "images" / name
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(image_path), media_type="image/jpeg")


@router.get("/{document_id}/layout-pdf")
def get_layout_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc(document_id, db)
    work_dir = Path(doc.folder_path)
    pdf_files = list(work_dir.glob("*_layouts.pdf"))
    if not pdf_files:
        raise HTTPException(status_code=404, detail="Layout PDF not found")
    return FileResponse(str(pdf_files[0]), media_type="application/pdf")


@router.get("/{document_id}/page/{page_num}/markdown")
def get_page_markdown(
    document_id: int,
    page_num: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the markdown content for a specific page (1-indexed)."""
    doc = _get_doc(document_id, db)
    work_dir = Path(doc.folder_path)
    mmd_files = list(work_dir.glob("*_with_captions.mmd"))
    if not mmd_files:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    content = mmd_files[0].read_text(encoding="utf-8")
    pages = re.split(r"\n---\s*\n?", content)
    pages = [p.strip() for p in pages if p.strip()]
    idx = page_num - 1
    if idx < 0 or idx >= len(pages):
        raise HTTPException(status_code=404, detail="Page not found")
    return {"content": pages[idx]}


@router.get("/{document_id}/page/{page_num}/thumbnail")
def get_page_thumbnail(
    document_id: int,
    page_num: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_doc(document_id, db)  # validate existence
    thumb_path = get_thumbnail_path(document_id, page_num)
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(str(thumb_path), media_type="image/jpeg")
