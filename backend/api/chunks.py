"""Chunk API endpoints: chunking, listing, editing, diffing, SSE status."""
import json
import logging
import re

logger = logging.getLogger(__name__)
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db, SessionLocal
from backend.models import Chunk, ChunkEdit, ChunkFeedback, ChunkImage, ChunkTask, Document, User
from backend.services.chunking import chunk_document
from backend.services.markdown_parser import extract_image_refs_from_chunk

router = APIRouter(tags=["chunks"])


# ---------------------------------------------------------------------------
# Async (semantic) chunking task tracking — stored in the DB (not process
# memory) so progress can be polled from any gunicorn worker.
# ---------------------------------------------------------------------------

def _task_create(task_id: str, document_id: int, total_pages: int):
    db = SessionLocal()
    try:
        db.add(ChunkTask(
            task_id=task_id, document_id=document_id,
            status="processing", progress=0, total=0,
            pages_done=0, total_pages=total_pages or 0,
        ))
        db.commit()
    finally:
        db.close()


def _task_update(task_id: str, **fields):
    db = SessionLocal()
    try:
        t = db.query(ChunkTask).filter(ChunkTask.task_id == task_id).first()
        if t:
            for k, v in fields.items():
                setattr(t, k, v)
            db.commit()
    finally:
        db.close()


def _task_get(task_id: str) -> dict:
    db = SessionLocal()
    try:
        t = db.query(ChunkTask).filter(ChunkTask.task_id == task_id).first()
        if not t:
            return {}
        return {
            "status": t.status, "progress": t.progress, "total": t.total,
            "pages_done": t.pages_done, "total_pages": t.total_pages,
            "error": t.error,
        }
    finally:
        db.close()


def _task_delete(task_id: str):
    db = SessionLocal()
    try:
        db.query(ChunkTask).filter(ChunkTask.task_id == task_id).delete()
        db.commit()
    finally:
        db.close()


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


def _get_image_filenames(document: Document) -> list:
    """Return sorted list of image filenames for a document, from FS or MinIO."""
    if document.source_type == "elasticsearch" and document.minio_prefix:
        from backend.services.minio_client import list_minio_objects
        prefix = document.minio_prefix
        objects = list_minio_objects(f"{prefix}/images/")
        return sorted(obj.rsplit("/", 1)[-1] for obj in objects)
    else:
        return _read_metadata_images(document.folder_path)


def _store_chunks(db: Session, document: Document, chunk_dicts: list, body: ChunkRequest):
    """Delete old chunks and store new ones with chunk_images.
    Never modifies document.chunking_strategy — for ES docs that field records the original
    ES strategy and must not be overwritten by local re-chunking."""
    # Delete existing chunks (CASCADE handles edits/feedback/images)
    db.query(Chunk).filter(Chunk.document_id == document.id).delete()
    db.flush()

    image_files = _get_image_filenames(document)

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
        "rag_score": chunk.rag_score,
        "faq_score": chunk.faq_score,
        "ai_suggestion": chunk.ai_suggestion,
    }
    return result


def _sync_chunk_to_es(db: Session, chunk: Chunk, content: str) -> bool:
    """Sync chunk content to Elasticsearch with re-embedding. Returns True on success.
    Skips sync if the chunk was re-chunked with a different strategy than the original ES strategy."""
    doc = db.query(Document).filter(Document.id == chunk.document_id).first()
    if not doc or doc.source_type != "elasticsearch" or not doc.es_index or not doc.es_parent_doc_id:
        return False

    if doc.chunking_strategy and chunk.chunking_strategy != doc.chunking_strategy:
        logger.info("Skipping ES sync: chunk strategy '%s' differs from original '%s'",
                     chunk.chunking_strategy, doc.chunking_strategy)
        return False

    from backend.services.es_client import update_es_chunk
    from backend.services.embedding import get_embedding_sync

    embedding = None
    try:
        embedding = get_embedding_sync(content)
    except Exception as e:
        logger.warning("Re-embedding failed for chunk %d, updating content only: %s", chunk.id, e)

    return update_es_chunk(doc.es_index, doc.es_parent_doc_id, chunk.chunk_index,
                           content, embedding)


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

    # Get markdown content from local FS or MinIO
    if document.source_type == "elasticsearch" and document.minio_prefix:
        from backend.services.minio_client import fetch_minio_text
        prefix = document.minio_prefix
        pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
        md_path = f"{prefix}/markdown/{pdf_name}_with_captions.mmd"
        try:
            markdown_content = fetch_minio_text(md_path)
        except Exception:
            raise HTTPException(status_code=400, detail="Markdown file not found in MinIO")
    else:
        mmd_file = _find_mmd_file(document.folder_path)
        if not mmd_file:
            raise HTTPException(status_code=400, detail="Markdown file not found")
        markdown_content = mmd_file.read_text(encoding="utf-8")

    strategy = body.strategy.lower()

    # For semantic strategy, run in background
    if strategy == "semantic":
        import uuid
        task_id = str(uuid.uuid4())
        _task_create(task_id, document.id, document.num_pages or 0)

        def _page_progress(pages_done: int, total_pages: int):
            _task_update(task_id, pages_done=pages_done, total_pages=total_pages)

        def _run_semantic():
            bg_db = SessionLocal()
            try:
                chunk_dicts = chunk_document(
                    markdown_content=markdown_content,
                    strategy=strategy,
                    chunk_size=body.chunk_size or 2000,
                    chunk_overlap=body.chunk_overlap or 200,
                    similarity_threshold=body.similarity_threshold or 0.5,
                    min_chunk_size=body.min_chunk_size or 100,
                    progress_fn=_page_progress,
                )
                _task_update(task_id, total=len(chunk_dicts))

                # Re-fetch document in new session
                doc = bg_db.query(Document).filter(Document.id == document_id).first()
                bg_db.query(Chunk).filter(Chunk.document_id == document_id).delete()
                bg_db.flush()

                image_files = _get_image_filenames(doc)
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

                    # Throttle progress writes (every 5 chunks + the last) so
                    # large docs don't issue a DB round-trip per chunk.
                    if (i + 1) % 5 == 0 or (i + 1) == len(chunk_dicts):
                        _task_update(task_id, progress=i + 1)

                bg_db.commit()
                _task_update(task_id, status="complete")
            except Exception as e:
                bg_db.rollback()
                _task_update(task_id, status="error", error=str(e))
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


@router.get("/api/documents/{document_id}/chunk-stats")
def chunk_stats(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return avg/median RAG and FAQ scores across all scored chunks."""
    rows = (
        db.query(Chunk.rag_score, Chunk.faq_score)
        .filter(Chunk.document_id == document_id)
        .all()
    )
    total = len(rows)
    if total == 0:
        return {"total": 0, "scored": 0, "avg_rag": None, "median_rag": None, "avg_faq": None, "median_faq": None}

    rag = sorted(r for r, _ in rows if r is not None)
    faq = sorted(f for _, f in rows if f is not None)
    scored = len(rag)

    def _median(vals):
        n = len(vals)
        if n == 0:
            return None
        mid = n // 2
        return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2

    return {
        "total": total,
        "scored": scored,
        "avg_rag": round(sum(rag) / len(rag), 2) if rag else None,
        "median_rag": _median(rag),
        "avg_faq": round(sum(faq) / len(faq), 2) if faq else None,
        "median_faq": _median(faq),
    }


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


@router.post("/api/chunks/{chunk_id}/evaluate")
async def evaluate_single_chunk(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-evaluate RAG/FAQ scores and AI suggestion for a single chunk.
    Uses the modified content if a ChunkEdit exists, otherwise the original content."""
    import tempfile
    from backend.services.llm_eval import evaluate_chunk_all
    from backend.services.pdf_thumbnails import get_thumbnail_path

    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    # Use edited content if available
    edit = (
        db.query(ChunkEdit)
        .filter(ChunkEdit.chunk_id == chunk_id)
        .first()
    )
    content = edit.modified_content if edit else chunk.content

    doc = db.query(Document).filter(Document.id == chunk.document_id).first()

    # Resolve thumbnail path
    thumb_path: str | None = None
    if doc and doc.source_type == "elasticsearch" and doc.minio_prefix:
        from backend.services.minio_client import fetch_minio_bytes
        prefix = doc.minio_prefix
        pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
        for candidate in [
            f"{prefix}/pages/{pdf_name}_{chunk.page_number}.png",
            f"{prefix}/pages/page_{chunk.page_number}.png",
        ]:
            try:
                data = fetch_minio_bytes(candidate)
                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp.write(data)
                tmp.close()
                thumb_path = tmp.name
                break
            except Exception:
                continue
    elif doc:
        p = get_thumbnail_path(doc.id, chunk.page_number)
        thumb_path = str(p) if p and p.exists() else None

    result = await evaluate_chunk_all(content, thumb_path)

    # Persist updated scores to DB
    chunk.rag_score = result.get("rag_score")
    chunk.faq_score = result.get("faq_score")
    chunk.ai_suggestion = result.get("ai_suggestion")
    db.commit()

    return {
        "chunk_id": chunk_id,
        "rag_score": chunk.rag_score,
        "faq_score": chunk.faq_score,
        "ai_suggestion": chunk.ai_suggestion,
    }


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

    # Sync to Elasticsearch if this chunk came from ES
    es_synced = _sync_chunk_to_es(db, chunk, body.modified_content)

    return {
        "id": edit.id,
        "chunk_id": edit.chunk_id,
        "original_content": edit.original_content,
        "modified_content": edit.modified_content,
        "es_synced": es_synced,
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

    # Revert ES content to the original before deleting the edit
    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    es_synced = False
    if chunk:
        es_synced = _sync_chunk_to_es(db, chunk, edit.original_content)

    db.delete(edit)
    db.commit()
    return {"detail": "Edit reverted", "es_synced": es_synced}


@router.delete("/api/chunks/{chunk_id}")
def delete_chunk(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a single chunk from SQLite and (if ES-sourced) from Elasticsearch."""
    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    es_synced = False
    doc = db.query(Document).filter(Document.id == chunk.document_id).first()
    if doc and doc.source_type == "elasticsearch" and doc.es_index and doc.es_parent_doc_id:
        from backend.services.es_client import delete_es_chunk
        es_synced = delete_es_chunk(doc.es_index, doc.es_parent_doc_id, chunk.chunk_index)

    db.delete(chunk)
    db.commit()
    return {"detail": "Chunk deleted", "es_synced": es_synced}


@router.delete("/api/documents/{document_id}/chunks")
def delete_all_chunks(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    deleted = db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.commit()
    return {"detail": f"Deleted {deleted} chunks"}


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
            task = await asyncio.to_thread(_task_get, task_id)

            status = task.get("status", "unknown")
            data = {
                "status": status,
                "progress": task.get("progress", 0),
                "total": task.get("total", 0),
                "pages_done": task.get("pages_done", 0),
                "total_pages": task.get("total_pages", 0),
            }

            if status == "error":
                data["message"] = task.get("error", "Unknown error")

            yield {"data": json.dumps(data)}

            if status in ("complete", "error"):
                # Clean up the finished task row
                await asyncio.to_thread(_task_delete, task_id)
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


# Need json import for SSE
import json as json


@router.get("/api/documents/{document_id}/evaluate-chunks")
async def evaluate_chunks_sse(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint: evaluate all chunks in parallel, streaming results as they complete."""
    import asyncio
    from sse_starlette.sse import EventSourceResponse
    from backend.services.llm_eval import evaluate_chunk_all
    from backend.services.pdf_thumbnails import get_thumbnail_path
    from backend.db import SessionLocal

    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    chunk_rows = (
        db.query(Chunk)
        .filter(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index)
        .all()
    )
    if not chunk_rows:
        raise HTTPException(status_code=404, detail="No chunks found")

    # Snapshot chunk info before closing the request db session
    chunk_info = [
        {"id": c.id, "content": c.content, "page_number": c.page_number}
        for c in chunk_rows
    ]
    total = len(chunk_info)

    async def event_generator():
        yield {"data": json.dumps({"type": "start", "total": total})}

        # Queue to collect results from parallel tasks
        result_queue: asyncio.Queue = asyncio.Queue()

        async def eval_one(info: dict):
            """Evaluate a single chunk and put result in queue."""
            # Get thumbnail path: local file or MinIO temp download
            if doc.source_type == "elasticsearch" and doc.minio_prefix:
                import tempfile
                from backend.services.minio_client import fetch_minio_bytes
                prefix = doc.minio_prefix
                pdf_name = prefix.split("/")[-1] if "/" in prefix else prefix
                thumb_path = None
                for candidate in [
                    f"{prefix}/pages/{pdf_name}_{info['page_number']}.png",
                    f"{prefix}/pages/page_{info['page_number']}.png",
                ]:
                    try:
                        data = fetch_minio_bytes(candidate)
                        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                        tmp.write(data)
                        tmp.close()
                        thumb_path = tmp.name
                        break
                    except Exception:
                        continue
                if not thumb_path:
                    thumb_path = ""
            else:
                thumb_path = str(get_thumbnail_path(document_id, info["page_number"]))
            try:
                async with semaphore:
                    result = await evaluate_chunk_all(info["content"], thumb_path)
                await result_queue.put({"chunk_id": info["id"], **result, "error": None})
            except Exception as e:
                logger.error("Eval failed for chunk %d: %s", info["id"], e)
                await result_queue.put({
                    "chunk_id": info["id"],
                    "rag_score": None, "faq_score": None, "ai_suggestion": None,
                    "error": str(e),
                })

        # Limit concurrent LLM calls to avoid overwhelming the server
        semaphore = asyncio.Semaphore(5)

        # Launch all chunk evaluations concurrently
        tasks = [asyncio.create_task(eval_one(info)) for info in chunk_info]

        # Persist and stream results as they arrive
        completed = 0
        eval_db = SessionLocal()
        try:
            while completed < total:
                result = await result_queue.get()
                completed += 1

                # Save to database
                chunk = eval_db.query(Chunk).filter(Chunk.id == result["chunk_id"]).first()
                if chunk:
                    if result["rag_score"] is not None:
                        chunk.rag_score = result["rag_score"]
                    if result["faq_score"] is not None:
                        chunk.faq_score = result["faq_score"]
                    if result["ai_suggestion"] is not None:
                        chunk.ai_suggestion = result["ai_suggestion"]
                    eval_db.commit()

                # Stream to client
                yield {"data": json.dumps({
                    "type": "result",
                    "chunk_id": result["chunk_id"],
                    "rag_score": result["rag_score"],
                    "faq_score": result["faq_score"],
                    "ai_suggestion": result["ai_suggestion"],
                    "completed": completed,
                    "total": total,
                })}

        finally:
            eval_db.close()
            for t in tasks:
                if not t.done():
                    t.cancel()

        yield {"data": json.dumps({"type": "done", "total": total})}

    return EventSourceResponse(event_generator())
