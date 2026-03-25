"""Feedback API endpoints: upsert and retrieve chunk feedback."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Chunk, ChunkFeedback, User

router = APIRouter(tags=["feedback"])

VALID_EMOJI_TYPES = {"correct", "incorrect", "needs_edit", "unclear", "partial"}


class FeedbackRequest(BaseModel):
    emoji_type: str
    comment: Optional[str] = ""

    @field_validator("emoji_type")
    @classmethod
    def validate_emoji_type(cls, v):
        if v not in VALID_EMOJI_TYPES:
            raise ValueError(f"emoji_type must be one of: {', '.join(sorted(VALID_EMOJI_TYPES))}")
        return v


@router.put("/api/chunks/{chunk_id}/feedback")
def upsert_feedback(
    chunk_id: int,
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    feedback = (
        db.query(ChunkFeedback)
        .filter(ChunkFeedback.chunk_id == chunk_id, ChunkFeedback.user_id == current_user.id)
        .first()
    )

    if feedback:
        feedback.emoji_type = body.emoji_type
        feedback.comment = body.comment or ""
    else:
        feedback = ChunkFeedback(
            chunk_id=chunk_id,
            user_id=current_user.id,
            emoji_type=body.emoji_type,
            comment=body.comment or "",
        )
        db.add(feedback)

    db.commit()
    db.refresh(feedback)

    return {
        "id": feedback.id,
        "chunk_id": feedback.chunk_id,
        "emoji_type": feedback.emoji_type,
        "comment": feedback.comment,
    }


@router.get("/api/chunks/{chunk_id}/feedback")
def get_feedback(
    chunk_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feedback = (
        db.query(ChunkFeedback)
        .filter(ChunkFeedback.chunk_id == chunk_id, ChunkFeedback.user_id == current_user.id)
        .first()
    )

    if not feedback:
        return {"chunk_id": chunk_id, "emoji_type": None, "comment": None}

    return {
        "id": feedback.id,
        "chunk_id": feedback.chunk_id,
        "emoji_type": feedback.emoji_type,
        "comment": feedback.comment,
    }
