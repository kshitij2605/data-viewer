"""
Chunking service — 5 strategies for splitting markdown into chunks.

Strategies:
1. CHARACTER  — CharacterTextSplitter (paragraph-based)
2. RECURSIVE  — RecursiveCharacterTextSplitter with Japanese/Markdown separators
3. SEMANTIC   — Embedding-based similarity grouping
4. MARKDOWN   — Header-aware splitting with hierarchy preservation
5. PAGE       — One chunk per page (split on --- delimiter)
"""

import re
import math
from typing import List, Dict, Optional, Callable

from langchain_text_splitters import (
    CharacterTextSplitter,
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)

# Japanese / Markdown-aware separators (order matters — coarsest first)
JAPANESE_MARKDOWN_SEPARATORS = [
    "\n\n",
    "\n",
    "。\n",
    "。",
    "．",
    ". ",
    "！",
    "？",
    "、",
    "，",
    ", ",
    " ",
    "",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _split_into_pages(markdown: str) -> List[tuple]:
    """Split markdown on ``\\n---\\n`` or ``\\n---`` delimiters.

    Returns list of ``(page_num, text)`` tuples (1-indexed).
    """
    # Split on --- that sits on its own line (with optional trailing whitespace)
    parts = re.split(r"\n---\s*\n?", markdown)
    pages = []
    for i, part in enumerate(parts, start=1):
        text = part.strip()
        if text:
            pages.append((i, text))
    return pages


def _determine_page_number(chunk_text: str, pages: List[tuple]) -> int:
    """Find which page owns the majority of *chunk_text* by checking overlap."""
    best_page = 1
    best_overlap = 0
    for page_num, page_text in pages:
        # Count how many characters of chunk_text appear in page_text
        overlap = 0
        for line in chunk_text.splitlines():
            line = line.strip()
            if line and line in page_text:
                overlap += len(line)
        if overlap > best_overlap:
            best_overlap = overlap
            best_page = page_num
    return best_page


def _extract_image_refs(content: str) -> List[str]:
    """Return list of image paths found in markdown image syntax."""
    return re.findall(r"!\[.*?\]\((images/[^)]+)\)", content)


# ---------------------------------------------------------------------------
# Cosine similarity (pure-python, no numpy required at import time)
# ---------------------------------------------------------------------------

def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Per-strategy split helpers
# ---------------------------------------------------------------------------

def _split_character(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    splitter = CharacterTextSplitter(
        separator="\n\n",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    return splitter.split_text(text)


def _split_recursive(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        separators=JAPANESE_MARKDOWN_SEPARATORS,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )
    return splitter.split_text(text)


def _split_semantic(
    text: str,
    chunk_size: int,
    similarity_threshold: float,
    min_chunk_size: int,
    embedding_fn: Callable[[str], List[float]],
    batch_embedding_fn: Optional[Callable[[List[str]], List[List[float]]]] = None,
) -> List[str]:
    """Split text into semantically coherent chunks using embeddings."""
    # Split into sentences
    pattern = r"(?<=[。．.!?！？])\s*"
    sentences = [s.strip() for s in re.split(pattern, text) if s.strip()]

    if len(sentences) <= 1:
        return [text.strip()] if text.strip() else []

    # Get embeddings — use batch call when available to avoid N round-trips
    try:
        if batch_embedding_fn is not None:
            embeddings = batch_embedding_fn(sentences)
        else:
            embeddings = [embedding_fn(s) for s in sentences]
    except Exception:
        # Fallback to recursive
        return _split_recursive(text, chunk_size, 100)

    chunks: List[str] = []
    current_chunk = [sentences[0]]
    current_emb = embeddings[0]

    for i in range(1, len(sentences)):
        sent = sentences[i]
        emb = embeddings[i]
        sim = _cosine_similarity(current_emb, emb)
        cur_len = sum(len(s) for s in current_chunk)

        if sim >= similarity_threshold and cur_len + len(sent) <= chunk_size:
            current_chunk.append(sent)
            # Running average embedding
            n = len(current_chunk)
            current_emb = [(ce * n + e) / (n + 1) for ce, e in zip(current_emb, emb)]
        else:
            chunk_text = " ".join(current_chunk)
            if len(chunk_text) >= min_chunk_size:
                chunks.append(chunk_text)
            current_chunk = [sent]
            current_emb = emb

    # Last chunk
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        if len(chunk_text) >= min_chunk_size:
            chunks.append(chunk_text)
        elif chunks:
            chunks[-1] += " " + chunk_text

    return chunks if chunks else [text.strip()]


def _split_markdown(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """Markdown header-aware splitting with hierarchy preservation."""
    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#", "heading_1"),
            ("##", "heading_2"),
            ("###", "heading_3"),
        ],
        strip_headers=False,
    )
    size_splitter = RecursiveCharacterTextSplitter(
        separators=JAPANESE_MARKDOWN_SEPARATORS,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    header_docs = header_splitter.split_text(text)
    chunks: List[str] = []

    for doc in header_docs:
        content = doc.page_content if hasattr(doc, "page_content") else str(doc)
        metadata = doc.metadata if hasattr(doc, "metadata") else {}

        # Build parent-header prefix (only headers NOT already in content)
        prefix_lines = []
        for level, key in [(1, "heading_1"), (2, "heading_2"), (3, "heading_3")]:
            hdr = metadata.get(key, "")
            if hdr:
                hdr_line = "#" * level + " " + hdr
                if not content.strip().startswith(hdr_line):
                    prefix_lines.append(hdr_line)

        header_prefix = "\n\n".join(prefix_lines)
        full = (header_prefix + "\n\n" + content) if header_prefix else content

        if len(full) > chunk_size:
            sub_chunks = size_splitter.split_text(full)
            if len(sub_chunks) <= 1:
                chunks.extend(sub_chunks)
            else:
                chunks.append(sub_chunks[0])
                # Continuation chunks get a breadcrumb marker
                if header_prefix:
                    headers = []
                    for line in header_prefix.split("\n"):
                        line = line.strip()
                        if line.startswith("#"):
                            headers.append(line.lstrip("#").strip())
                    breadcrumb = " > ".join(h for h in headers if h)
                    marker = f"[続き: {breadcrumb}]" if breadcrumb else ""
                    for sc in sub_chunks[1:]:
                        chunks.append(f"{marker}\n\n{sc}" if marker else sc)
                else:
                    chunks.extend(sub_chunks[1:])
        else:
            chunks.append(full)

    return chunks


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def chunk_document(
    markdown_content: str,
    strategy: str,
    chunk_size: int = 2000,
    chunk_overlap: int = 200,
    similarity_threshold: float = 0.5,
    min_chunk_size: int = 100,
    embedding_fn: Optional[Callable] = None,
    metadata_images: Optional[list] = None,
    progress_fn: Optional[Callable[[int, int], None]] = None,
) -> List[Dict]:
    """Chunk *markdown_content* and return a list of chunk dicts.

    Each dict contains::

        {
            "content": str,
            "chunk_index": int,
            "page_number": int,        # 1-indexed
            "image_refs": List[str],    # e.g. ["images/1_0.jpg"]
            "chunking_strategy": str,
        }
    """
    strategy_lower = strategy.lower()
    pages = _split_into_pages(markdown_content)

    # ------------------------------------------------------------------
    # PAGE strategy — one chunk per page, no further splitting
    # ------------------------------------------------------------------
    if strategy_lower == "page":
        results = []
        for idx, (page_num, page_text) in enumerate(pages):
            results.append(
                {
                    "content": page_text,
                    "chunk_index": idx,
                    "page_number": page_num,
                    "image_refs": _extract_image_refs(page_text),
                    "chunking_strategy": "page",
                }
            )
        return results

    # ------------------------------------------------------------------
    # For other strategies: chunk each page separately, then collect
    # ------------------------------------------------------------------
    # Resolve embedding function for semantic strategy
    batch_embedding_fn = None
    if strategy_lower == "semantic" and embedding_fn is None:
        from backend.services.embedding import get_embedding_sync, get_embeddings_sync_batch
        embedding_fn = get_embedding_sync
        batch_embedding_fn = get_embeddings_sync_batch

    results: List[Dict] = []
    chunk_idx = 0
    total_pages = len(pages)

    for page_idx, (page_num, page_text) in enumerate(pages):
        if strategy_lower == "character":
            chunks = _split_character(page_text, chunk_size, chunk_overlap)
        elif strategy_lower == "recursive":
            chunks = _split_recursive(page_text, chunk_size, chunk_overlap)
        elif strategy_lower == "semantic":
            chunks = _split_semantic(
                page_text, chunk_size, similarity_threshold, min_chunk_size,
                embedding_fn, batch_embedding_fn,
            )
        elif strategy_lower in ("markdown", "page_markdown"):
            chunks = _split_markdown(page_text, chunk_size, chunk_overlap)
        else:
            raise ValueError(f"Unknown chunking strategy: {strategy}")

        if progress_fn is not None:
            progress_fn(page_idx + 1, total_pages)

        for chunk_text in chunks:
            results.append(
                {
                    "content": chunk_text,
                    "chunk_index": chunk_idx,
                    "page_number": page_num,
                    "image_refs": _extract_image_refs(chunk_text),
                    "chunking_strategy": strategy_lower,
                }
            )
            chunk_idx += 1

    return results
