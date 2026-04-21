from sqlalchemy import (
    Column, Integer, String, Text, Float, ForeignKey, TIMESTAMP, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    display_name = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    edits = relationship("ChunkEdit", back_populates="user")
    feedback = relationship("ChunkFeedback", back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    folder_name = Column(Text, nullable=False)
    folder_path = Column(Text, unique=True, nullable=False)
    pdf_title = Column(Text)
    num_pages = Column(Integer, default=0)
    num_images = Column(Integer, default=0)
    num_tables = Column(Integer, default=0)
    ai_review = Column(Text, nullable=True)
    ai_review_status = Column(Text, default="pending")  # pending, running, done, error
    source_type = Column(Text, default="local")  # "local" or "elasticsearch"
    es_index = Column(Text, nullable=True)
    es_parent_doc_id = Column(Text, nullable=True)
    minio_prefix = Column(Text, nullable=True)  # e.g. "index_name/pdf_name"
    loaded_at = Column(TIMESTAMP, server_default=func.now())
    loaded_by_user_id = Column(Integer, ForeignKey("users.id"))

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")
    loaded_by = relationship("User")


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    page_number = Column(Integer, default=1)
    content = Column(Text, nullable=False)
    chunking_strategy = Column(Text, nullable=False)
    chunk_size_setting = Column(Integer, default=2000)
    chunk_overlap_setting = Column(Integer, default=200)
    similarity_threshold = Column(Float)
    min_chunk_size = Column(Integer)
    rag_score = Column(Float, nullable=True)
    faq_score = Column(Float, nullable=True)
    ai_suggestion = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    document = relationship("Document", back_populates="chunks")
    edits = relationship("ChunkEdit", back_populates="chunk", cascade="all, delete-orphan")
    feedback = relationship("ChunkFeedback", back_populates="chunk", cascade="all, delete-orphan")
    images = relationship("ChunkImage", back_populates="chunk", cascade="all, delete-orphan")


class ChunkEdit(Base):
    __tablename__ = "chunk_edits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chunk_id = Column(Integer, ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_content = Column(Text, nullable=False)
    modified_content = Column(Text, nullable=False)
    edited_at = Column(TIMESTAMP, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("chunk_id", "user_id"),
    )

    chunk = relationship("Chunk", back_populates="edits")
    user = relationship("User", back_populates="edits")


class ChunkFeedback(Base):
    __tablename__ = "chunk_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chunk_id = Column(Integer, ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji_type = Column(Text)
    comment = Column(Text, default="")
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())

    __table_args__ = (
        CheckConstraint("emoji_type IN ('correct','incorrect','needs_edit','unclear','partial')"),
        UniqueConstraint("chunk_id", "user_id"),
    )

    chunk = relationship("Chunk", back_populates="feedback")
    user = relationship("User", back_populates="feedback")


class ChunkImage(Base):
    __tablename__ = "chunk_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chunk_id = Column(Integer, ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    image_name = Column(Text, nullable=False)
    page_index = Column(Integer, nullable=False)
    category = Column(Text)
    bbox_json = Column(Text)

    chunk = relationship("Chunk", back_populates="images")
