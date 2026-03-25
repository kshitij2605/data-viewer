"""Chunk API endpoints: chunking, listing, editing, diffing, SSE status."""
import json
import re
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Chunk, ChunkEdit, ChunkFeedback, ChunkImage, Document, User
from backend.services.chunking import chunk_document
from backend.services.markdown_parser import extract_image_refs_from_chunk

router = APIRouter(tags=["chunks"])

# In-memory task tracking for async (semantic) chunking
_chunk_tasks: dict = {}
_chunk_tasks_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChunkRequest(BaseModel):
    strategy: str
    chunk_size: Optional[int] = 2000
    chunk_overlap: Optional[int] = 200
    similarity_threshold: Optional[float] = 0.5
    min_chunk_size: Optional[int] = 100


class EditRequest(BaseModel):
    modified_content: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_mmd_file(folder_path: str) -> Optional[Path]:
    """Find the *_with_captions.mmd file in the document folder."""
    folder = Path(folder_path)
    candidates = list(folder.glob("*_with_captions.mmd"))
    return candidates[0] if candidates else None


def _read_metadata_images(folder_path: str) -> list:
    """Read metadata.json and return image filenames list from the images dir."""
    folder = Path(folder_path)
    images_dir = folder / "images"
    if images_dir.is_dir():
        return sorted(f.name for f in images_dir.iterdir() if f.is_file())
    return []


def _store_chunks(db: Session, document: Document, chunk_dicts: list, body: ChunkRequest):
    """Delete old chunks and store new ones with chunk_images."""
    # Delete existing chunks (CASCADE handles edits/feedback/images)
    db.query(Chunk).filter(Chunk.document_id == document.id).delete()
    db.flush()

    image_files = _read_metadata_images(document.folder_path)

    for cd in chunk_dicts:
        chunk = Chunk(
            document_id=document.id,
            chunk_index=cd["chunk_index"],
            page_number=cd["page_number"],
            content=cd["content"],
            chunking_strategy=cd["chunking_strategy"],
            chunk_size_setting=body.chunk_size,
            chunk_overlap_setting=body.chunk_overlap,
            similarity_threshold=body.similarity_threshold,
            min_chunk_size=body.min_chunk_size,
        )
        db.add(chunk)
        db.flush()  # get chunk.id

        # Create chunk_images by matching image refs
        image_refs = extract_image_refs_from_chunk(cd["content"])
        for ref in image_refs:
            # ref is like "images/1_0.jpg" — extract just the filename
            img_name = ref.replace("images/", "") if "/" in ref else ref
            if img_name in image_files:
                # Parse page_index from filename (e.g., "1_0.jpg" -> page 1)
                match = re.match(r"(\d+)_\d+\.jpg", img_name)
                page_idx = int(match.group(1)) if match else cd["page_number"]
                chunk_image = ChunkImage(
                    chunk_id=chunk.id,
                    image_name=img_name,
                    page_index=page_idx,
                )
                db.add(chunk_image)

    db.commit()


def _format_chunk_response(chunk: Chunk, edit: Optional[ChunkEdit] = None,
                           feedback: Optional[ChunkFeedback] = None) -> dict:
    """Format a chunk for API response."""
    content = chunk.content
    is_modified = False
    if edit and edit.modified_content:
        content = edit.modified_content
        is_modified = True

    image_refs = [img.image_name for img in chunk.images] if chunk.images else []

    result = {
        "id": chunk.id,
        "chunk_index": chunk.chunk_index,
        "page_number": chunk.page_number,
        "content": content,
        "is_modified": is_modified,
        "feedback_emoji": feedback.emoji_type if feedback else None,
        "feedback_comment": feedback.comment if feedback else None,
        "image_refs": image_refs,
    }
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/api/documents/{document_id}/chunk")
def chunk_document_endpoint(
    document_id: int,
    body: ChunkRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    mmd_file = _find_mmd_file(document.folder_path)
    if not mmd_file:
        raise HTTPException(status_code=400, detail="Markdown file not found")

    markdown_content = mmd_file.read_text(encoding="utf-8")

    strategy = body.strategy.lower()

    # For semantic strategy, run in background
    if strategy == "semantic":
        import uuid
        task_id = str(uuid.uuid4())
        with _chunk_tasks_lock:
            _chunk_tasks[task_id] = {"status": "processing", "progress": 0, "total": 0}

        def _run_semantic():
            from backend.db import SessionLocal
            bg_db = SessionLocal()
            try:
                chunk_dicts = chunk_document(
                    markdown_content=markdown_content,
                    strategy=strategy,
                    chunk_size=body.chunk_size or 2000,
                    chunk_overlap=body.chunk_overlap or 200,
                    similarity_threshold=body.similarity_threshold or 0.5,
                    min_chunk_size=body.min_chunk_size or 100,
                )
                with _chunk_tasks_lock:
                    _chunk_tasks[task_id]["total"] = len(chunk_dicts)

                # Re-fetch document in new session
                doc = bg_db.query(Document).filter(Document.id == document_id).first()
                bg_db.query(Chunk).filter(Chunk.document_id == document_id).delete()
                bg_db.flush()

                image_files = _read_metadata_images(doc.folder_path)
                for i, cd in enumerate(chunk_dicts):
                    chunk = Chunk(
                        document_id=doc.id,
                        chunk_index=cd["chunk_index"],
                        page_number=cd["page_number"],
                        content=cd["content"],
                        chunking_strategy=cd["chunking_strategy"],
                        chunk_size_setting=body.chunk_size,
                        chunk_overlap_setting=body.chunk_overlap,
                        similarity_threshold=body.similarity_threshold,
                        min_chunk_size=body.min_chunk_size,
                    )
                    bg_db.add(chunk)
                    bg_db.flush()

                    image_refs = extract_image_refs_from_chunk(cd["content"])
                    for ref in image_refs:
                        img_name = ref.replace("images/", "") if "/" in ref else ref
                        if img_name in image_files:
                            match = re.match(r"(\d+)_\d+\.jpg", img_name)
                            page_idx = int(match.group(1)) if match else cd["page_number"]
                            bg_db.add(ChunkImage(
                                chunk_id=chunk.id,
                                image_name=img_name,
                                page_index=page_idx,
                            ))

                    with _chunk_tasks_lock:
                        _chunk_tasks[task_id]["progress"] = i + 1

                bg_db.commit()
                with _chunk_tasks_lock:
                    _chunk_tasks[task_id]["status"] = "complete"
            except Exception as e:
                bg_db.rollback()
                with _chunk_tasks_lock:
                    _chunk_tasks[task_id]["status"] = "error"
                    _chunk_tasks[task_id]["error"] = str(e)
            finally:
                bg_db.close()

        background_tasks.add_task(_run_semantic)
        return {"task_id": task_id, "status": "processing"}

    # Synchronous strategies
    chunk_dicts = chunk_document(
        markdown_content=markdown_content,
        strategy=strategy,
        chunk_size=body.chunk_size or 2000,
        chunk_overlap=body.chunk_overlap or 200,
        similarity_threshold=body.similarity_threshold or 0.5,
        min_chunk_size=body.min_chunk_size or 100,
    )

    _store_chunks(db, document, chunk_dicts, body)

    # Return stored chunks
    chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index)
        .all()
    )
    return [_format_chunk_response(c) for c in chunks]


@router.get("/api/documents/{document_id}/chunks")
def list_chunks(
    document_id: int,
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Build query with left joins
    query = (
        db.query(Chunk, ChunkEdit, ChunkFeedback)
        .outerjoin(ChunkEdit, (ChunkEdit.chunk_id == Chunk.id) & (ChunkEdit.user_id == current_user.id))
        .outerjoin(ChunkFeedback, (ChunkFeedback.chunk_id == Chunk.id) & (ChunkFeedback.user_id == current_user.id))
        .filter(Chunk.document_id == document_id)
    )

    if search:
        pattern = f"%{search}%"
        from sqlalchemy import case, or_
        # Search in modified content if exists, otherwise original
        query = query.filter(
            or_(
                ChunkEdit.modified_content.like(pattern),
                (ChunkEdit.id.is_(None)) & (Chunk.content.like(pattern)),
            )
        )

    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(Chunk.chunk_index)
        .offset(offset)
        .limit(per_page)
        .all()
    )

    chunks = []
    for chunk, edit, feedback in rows:
        chunks.append(_format_chunk_response(chunk, edit, feedback))

    return {
        "chunks": chunks,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/api/documents/{document_id}/chunks/{chunk_id}")
def get_chunk(
    document_id: int,
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(Chunk, ChunkEdit, ChunkFeedback)
        .outerjoin(ChunkEdit, (ChunkEdit.chunk_id == Chunk.id) & (ChunkEdit.user_id == current_user.id))
        .outerjoin(ChunkFeedback, (ChunkFeedback.chunk_id == Chunk.id) & (ChunkFeedback.user_id == current_user.id))
        .filter(Chunk.id == chunk_id, Chunk.document_id == document_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Chunk not found")

    chunk, edit, feedback = row
    return _format_chunk_response(chunk, edit, feedback)


@router.put("/api/chunks/{chunk_id}/edit")
def edit_chunk(
    chunk_id: int,
    body: EditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    # Upsert
    edit = (
        db.query(ChunkEdit)
        .filter(ChunkEdit.chunk_id == chunk_id, ChunkEdit.user_id == current_user.id)
        .first()
    )
    if edit:
        edit.modified_content = body.modified_content
    else:
        edit = ChunkEdit(
            chunk_id=chunk_id,
            user_id=current_user.id,
            original_content=chunk.content,
            modified_content=body.modified_content,
        )
        db.add(edit)

    db.commit()
    db.refresh(edit)
    return {
        "id": edit.id,
        "chunk_id": edit.chunk_id,
        "original_content": edit.original_content,
        "modified_content": edit.modified_content,
    }


@router.get("/api/chunks/{chunk_id}/diff")
def get_diff(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    edit = (
        db.query(ChunkEdit)
        .filter(ChunkEdit.chunk_id == chunk_id, ChunkEdit.user_id == current_user.id)
        .first()
    )
    if not edit:
        raise HTTPException(status_code=404, detail="No edit found for this chunk")

    return {
        "original": edit.original_content,
        "modified": edit.modified_content,
    }


@router.delete("/api/chunks/{chunk_id}/edit")
def delete_edit(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    edit = (
        db.query(ChunkEdit)
        .filter(ChunkEdit.chunk_id == chunk_id, ChunkEdit.user_id == current_user.id)
        .first()
    )
    if not edit:
        raise HTTPException(status_code=404, detail="No edit found for this chunk")

    db.delete(edit)
    db.commit()
    return {"detail": "Edit reverted"}


@router.get("/api/documents/{document_id}/chunk-status")
async def chunk_status_sse(
    document_id: int,
    task_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint for chunk processing status."""
    import asyncio
    from sse_starlette.sse import EventSourceResponse

    async def event_generator():
        if not task_id:
            yield {"data": json.dumps({"status": "error", "message": "No task_id provided"})}
            return

        while True:
            with _chunk_tasks_lock:
                task = _chunk_tasks.get(task_id, {})

            status = task.get("status", "unknown")
            data = {
                "status": status,
                "progress": task.get("progress", 0),
                "total": task.get("total", 0),
            }

            if status == "error":
                data["message"] = task.get("error", "Unknown error")

            yield {"data": json.dumps(data)}

            if status in ("complete", "error"):
                # Clean up task
                with _chunk_tasks_lock:
                    _chunk_tasks.pop(task_id, None)
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


# Need json import for SSE
import json as json
