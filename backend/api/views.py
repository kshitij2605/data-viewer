"""Parsed-view endpoints for documents (text-only, tables-only, images-only)."""
import json
import re
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
    extract_table_html_map,
)

router = APIRouter(prefix="/api/documents", tags=["views"])


def _get_document(document_id: int, db: Session) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _is_minio(doc: Document) -> bool:
    return doc.source_type == "elasticsearch"


def _read_markdown(document_id: int, db: Session) -> str:
    doc = _get_document(document_id, db)
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
    doc = _get_document(document_id, db)

    # Extract markdown tables from .mmd file
    md = _read_markdown(document_id, db)
    md_tables = extract_tables(md)

    # Collect table images
    table_images = []
    if _is_minio(doc):
        from backend.services.minio_client import list_minio_objects
        prefix = doc.minio_prefix
        objects = list_minio_objects(f"{prefix}/tables/")
        for obj_name in sorted(objects):
            filename = obj_name.rsplit("/", 1)[-1]
            match = re.match(r"(?:.*_)?(\d+)[_]", filename)
            page_num = int(match.group(1)) if match else None
            table_images.append({"filename": filename, "page_number": page_num})
    else:
        work_dir = Path(doc.folder_path)
        tables_dir = work_dir / "tables"
        if tables_dir.is_dir():
            for f in sorted(tables_dir.iterdir()):
                if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
                    match = re.match(r"(?:page)?(\d+)[_]", f.name)
                    page_num = int(match.group(1)) if match else None
                    table_images.append({"filename": f.name, "page_number": page_num})

    # Extract HTML table content mapped to table image filenames
    table_html_map = extract_table_html_map(md)

    return {"tables": md_tables, "table_images": table_images, "table_html_map": table_html_map}


@router.get("/{document_id}/images-only")
def get_images_only(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    md = _read_markdown(document_id, db)
    images = extract_images_with_captions(md)

    # Enrich with image categories from parsing_metrics.json
    doc = _get_document(document_id, db)
    category_map: dict[str, str] = {}

    if _is_minio(doc):
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        metrics_path = f"{prefix}/metadata/parsing_metrics.json"
        try:
            metrics_bytes = fetch_minio_bytes(metrics_path)
            metrics = json.loads(metrics_bytes)
            for img_info in metrics.get("images", []):
                name = img_info.get("name", "")
                category = img_info.get("category", "")
                if name and category:
                    category_map[name] = category
        except Exception:
            pass
    else:
        work_dir = Path(doc.folder_path)
        metrics_path = work_dir / "parsing_metrics.json"
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
