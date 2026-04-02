"""Document loading and listing endpoints."""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Document, User
from backend.services.pdf_thumbnails import generate_thumbnails

router = APIRouter(prefix="/api/documents", tags=["documents"])


class LoadRequest(BaseModel):
    folder_path: str


class DocumentOut(BaseModel):
    id: int
    folder_name: str
    folder_path: str
    pdf_title: Optional[str] = None
    num_pages: int
    num_images: int
    num_tables: int

    class Config:
        from_attributes = True


@router.post("/load", response_model=DocumentOut)
def load_document(
    body: LoadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = Path(body.folder_path)

    # Check folder exists
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="Folder path does not exist")

    # Find metadata.json — could be directly in folder or in a subfolder
    metadata_path = _find_metadata(folder)
    if metadata_path is None:
        raise HTTPException(status_code=400, detail="metadata.json not found in folder")

    # The working directory is the parent of metadata.json
    work_dir = metadata_path.parent

    # Check for duplicate
    existing = db.query(Document).filter(Document.folder_path == str(work_dir)).first()
    if existing:
        return existing

    # Read metadata
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    if "num_pages" not in metadata:
        raise HTTPException(status_code=400, detail="Invalid metadata.json format: missing required field 'num_pages'")

    pdf_title = metadata.get("pdf_title", "")
    num_pages = metadata.get("num_pages", 0)
    num_images_data = metadata.get("num_images", 0)
    num_images = num_images_data.get("total", 0) if isinstance(num_images_data, dict) else int(num_images_data)
    num_tables = metadata.get("num_tables", 0)

    doc = Document(
        folder_name=work_dir.name,
        folder_path=str(work_dir),
        pdf_title=pdf_title,
        num_pages=num_pages,
        num_images=num_images,
        num_tables=num_tables,
        loaded_by_user_id=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Generate thumbnails from layout PDF
    layout_pdfs = list(work_dir.glob("*_layouts.pdf"))
    if layout_pdfs:
        try:
            generate_thumbnails(str(layout_pdfs[0]), doc.id)
        except Exception:
            pass  # thumbnails are optional

    return doc


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()


@router.get("", response_model=list[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Document).all()


@router.get("/{document_id}")
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    work_dir = Path(doc.folder_path)

    # Read metadata.json
    metadata = {}
    metadata_path = work_dir / "metadata.json"
    if metadata_path.exists():
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

    # Read parsing_metrics.json
    parsing_metrics = {}
    metrics_path = work_dir / "parsing_metrics.json"
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            parsing_metrics = json.load(f)

    return {
        "id": doc.id,
        "folder_name": doc.folder_name,
        "folder_path": doc.folder_path,
        "pdf_title": doc.pdf_title,
        "num_pages": doc.num_pages,
        "num_images": doc.num_images,
        "num_tables": doc.num_tables,
        "metadata": metadata,
        "parsing_metrics": parsing_metrics,
    }


def _find_metadata(folder: Path) -> Optional[Path]:
    """Find metadata.json in the folder or its first subfolder."""
    direct = folder / "metadata.json"
    if direct.exists():
        return direct
    # Check subfolders
    for child in sorted(folder.iterdir()):
        if child.is_dir():
            candidate = child / "metadata.json"
            if candidate.exists():
                return candidate
    return None
