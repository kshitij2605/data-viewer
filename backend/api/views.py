"""Parsed-view endpoints for documents (text-only, tables-only, images-only)."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Document, User
from backend.services.markdown_parser import (
    extract_text_only,
    extract_tables,
    extract_images_with_captions,
)

router = APIRouter(prefix="/api/documents", tags=["views"])


def _get_document(document_id: int, db: Session) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _read_markdown(document_id: int, db: Session) -> str:
    doc = _get_document(document_id, db)
    work_dir = Path(doc.folder_path)
    mmd_files = list(work_dir.glob("*_with_captions.mmd"))
    if not mmd_files:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    return mmd_files[0].read_text(encoding="utf-8")


@router.get("/{document_id}/text-only")
def get_text_only(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    md = _read_markdown(document_id, db)
    return {"paragraphs": extract_text_only(md)}


@router.get("/{document_id}/tables-only")
def get_tables_only(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    md = _read_markdown(document_id, db)
    return {"tables": extract_tables(md)}


@router.get("/{document_id}/images-only")
def get_images_only(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    md = _read_markdown(document_id, db)
    images = extract_images_with_captions(md)

    # Enrich with image categories from parsing_metrics.json if available
    doc = _get_document(document_id, db)
    work_dir = Path(doc.folder_path)
    metrics_path = work_dir / "parsing_metrics.json"
    category_map: dict[str, str] = {}
    if metrics_path.exists():
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                metrics = json.load(f)
            for img_info in metrics.get("images", []):
                name = img_info.get("name", "")
                category = img_info.get("category", "")
                if name and category:
                    category_map[name] = category
        except (json.JSONDecodeError, KeyError):
            pass

    for img in images:
        img_name = img["image_path"].replace("images/", "")
        img["image_type"] = category_map.get(img_name, "")

    return {"images": images}
