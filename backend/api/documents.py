"""Document loading and listing endpoints."""
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db, SessionLocal
from backend.models import Document, User
from backend.services.pdf_thumbnails import generate_thumbnails

logger = logging.getLogger(__name__)

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
    ai_review_status: Optional[str] = "pending"
    source_type: Optional[str] = "local"
    es_index: Optional[str] = None
    es_parent_doc_id: Optional[str] = None
    chunking_strategy: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/load", response_model=DocumentOut)
async def load_document(
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

    # Trigger AI review in background
    _launch_ai_review(doc.id, str(work_dir), num_pages, num_images, num_tables)

    return doc


@router.delete("/all", status_code=204)
def delete_all_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all documents for the current user. Cascade deletes all chunks, edits, feedback, and images."""
    db.query(Document).filter(Document.loaded_by_user_id == current_user.id).delete()
    db.commit()


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

    metadata = {}
    parsing_metrics = {}

    if doc.source_type == "elasticsearch" and doc.minio_prefix:
        # Fetch parsing_metrics from MinIO
        from backend.services.minio_client import fetch_minio_bytes
        metrics_path = f"{doc.minio_prefix}/metadata/parsing_metrics.json"
        try:
            parsing_metrics = json.loads(fetch_minio_bytes(metrics_path))
        except Exception:
            pass
    else:
        work_dir = Path(doc.folder_path)

        metadata_path = work_dir / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

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
        "source_type": doc.source_type or "local",
        "chunking_strategy": doc.chunking_strategy,
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


def _find_mmd_file(folder_path: str) -> Optional[Path]:
    """Find the *_with_captions.mmd file in the document folder."""
    folder = Path(folder_path)
    candidates = list(folder.glob("*_with_captions.mmd"))
    return candidates[0] if candidates else None


def _launch_ai_review(doc_id: int, folder_path: str, num_pages: int, num_images: int, num_tables: int):
    """Launch async AI review task for a newly loaded document."""
    async def _run():
        from backend.services.llm_eval import evaluate_chunking_strategy
        bg_db = SessionLocal()
        try:
            doc = bg_db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                return

            # Get markdown content depending on source
            markdown_content = None
            if doc.source_type == "elasticsearch" and doc.minio_prefix:
                from backend.services.minio_client import fetch_minio_text
                prefix = doc.minio_prefix
                pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
                md_path = f"{prefix}/markdown/{pdf_name}_with_captions.mmd"
                try:
                    markdown_content = fetch_minio_text(md_path)
                except Exception as e:
                    logger.warning("Could not fetch markdown from MinIO: %s", e)
            else:
                mmd_file = _find_mmd_file(folder_path)
                if mmd_file:
                    markdown_content = mmd_file.read_text(encoding="utf-8")

            if not markdown_content:
                doc.ai_review_status = "error"
                doc.ai_review = "Markdownファイルが見つかりません"
                bg_db.commit()
                return

            doc.ai_review_status = "running"
            bg_db.commit()

            review = await evaluate_chunking_strategy(markdown_content, num_pages, num_images, num_tables, doc_title=doc.pdf_title or doc.folder_name)

            doc.ai_review = review
            doc.ai_review_status = "done"
            bg_db.commit()
        except Exception as e:
            logger.error("AI review failed for doc %d: %s", doc_id, e)
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
        # No running loop — skip
        pass


@router.get("/{document_id}/ai-review")
def get_ai_review(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "status": doc.ai_review_status or "pending",
        "review": doc.ai_review,
    }


@router.post("/{document_id}/ai-review/retry")
async def retry_ai_review(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.ai_review_status = "pending"
    doc.ai_review = None
    db.commit()

    _launch_ai_review(doc.id, doc.folder_path, doc.num_pages, doc.num_images, doc.num_tables)
    return {"status": "pending"}
