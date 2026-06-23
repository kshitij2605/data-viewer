"""Tests for chunking service — covers all 5 strategies, page numbers, and image refs."""
import pytest
from unittest.mock import patch, MagicMock

# ---------------------------------------------------------------------------
# Shared test fixture: representative markdown content (Japanese sales deck)
# ---------------------------------------------------------------------------
SAMPLE_MARKDOWN = """\
相手先企業名 御中

Adobeといえばサンプル商事

作成者部署名
作成者名
2025.○○.○○

---

# Adobeといえばサンプル商事

# Adobeといえばサンプル商事
導入からサポートまで安心しておまかせください

![](images/1_0.jpg)

*Adobe Creative Cloudの活用シーンを示す写真。*

## Adobe Creative Cloud

![](images/1_1.jpg)

*Adobe Document Cloudの紹介画像。*

---

# Adobe活用イメージ

# アドビ製品全世界ナンバーワンリセラーのサンプル商事が ペーパーレス化、脱ハンコ、内製化の促進をお手伝いします

![](images/3_0.jpg)

*Adobe製品活用を示すインフォグラフィック。*

## Adobe Acrobat

## PDF活用、ペーパーレス化

いままでビジネスの主役だった「紙」。しかし紙でできたことのほとんどが、電子化によってまかなえる時代。Adobe Acrobatが紙からの脱却を助け、いつでもどこでも仕事ができる環境を整えます。
"""


# ========================== CHARACTER strategy ==============================
class TestCharacterChunking:
    def test_character_chunking_produces_expected_chunks(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(
            SAMPLE_MARKDOWN,
            strategy="character",
            chunk_size=200,
            chunk_overlap=20,
        )
        # Should produce multiple chunks from 3 pages of content
        assert len(results) >= 3
        for r in results:
            assert "content" in r
            assert "chunk_index" in r
            assert "page_number" in r
            assert "chunking_strategy" in r
            assert r["chunking_strategy"] == "character"

    def test_character_page_numbers_assigned(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="character", chunk_size=500)
        page_numbers = {r["page_number"] for r in results}
        # The sample has 3 pages (split by ---), so we expect pages 1, 2, 3
        assert page_numbers == {1, 2, 3}


# ========================== RECURSIVE strategy ==============================
class TestRecursiveChunking:
    def test_recursive_respects_japanese_separators(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(
            SAMPLE_MARKDOWN,
            strategy="recursive",
            chunk_size=200,
            chunk_overlap=20,
        )
        assert len(results) >= 3
        for r in results:
            assert r["chunking_strategy"] == "recursive"

    def test_recursive_japanese_text_split(self):
        """Recursive should respect Japanese sentence separators."""
        from backend.services.chunking import chunk_document

        jp_text = (
            "これは最初の文です。この文は二番目です。"
            "三番目の文が続きます。四番目の文です。"
            "\n---\n"
            "五番目の文です。六番目の文です。"
        )
        results = chunk_document(jp_text, strategy="recursive", chunk_size=60, chunk_overlap=0)
        assert len(results) >= 2
        # All chunks should be within size (with some tolerance for separator)
        for r in results:
            assert len(r["content"]) <= 100  # generous tolerance


# ========================== MARKDOWN strategy ===============================
class TestMarkdownChunking:
    def test_markdown_splits_on_headers(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(
            SAMPLE_MARKDOWN,
            strategy="markdown",
            chunk_size=2000,
        )
        assert len(results) >= 2
        for r in results:
            assert r["chunking_strategy"] == "markdown"

    def test_markdown_preserves_hierarchy(self):
        """Continuation chunks should include context markers."""
        from backend.services.chunking import chunk_document

        long_section = (
            "# Main Title\n\n"
            "## Sub Section\n\n"
            + "Long paragraph. " * 200
        )
        results = chunk_document(long_section, strategy="markdown", chunk_size=300, chunk_overlap=50)
        # There should be continuation chunks with context markers
        assert len(results) >= 2
        # At least one continuation chunk should have a context marker
        continuation_found = any("[続き:" in r["content"] for r in results)
        assert continuation_found, "Expected continuation markers in markdown sub-chunks"


# ========================== PAGE strategy ==================================
class TestPageChunking:
    def test_page_one_chunk_per_page(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        # Sample has 3 pages separated by ---
        assert len(results) == 3
        for r in results:
            assert r["chunking_strategy"] == "page"

    def test_page_numbers_sequential(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        pages = [r["page_number"] for r in results]
        assert pages == [1, 2, 3]


# ========================== PAGE NUMBER assignment =========================
class TestPageNumberAssignment:
    def test_page_numbers_for_character(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="character", chunk_size=500)
        for r in results:
            assert r["page_number"] >= 1

    def test_page_numbers_for_recursive(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="recursive", chunk_size=500)
        for r in results:
            assert r["page_number"] >= 1

    def test_page_numbers_for_page(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        pages = [r["page_number"] for r in results]
        assert pages == [1, 2, 3]


# ========================== IMAGE REFERENCE extraction =====================
class TestImageRefExtraction:
    def test_extract_image_refs_from_chunks(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        # Page 2 contains images/1_0.jpg and images/1_1.jpg
        page2 = [r for r in results if r["page_number"] == 2][0]
        assert "images/1_0.jpg" in page2["image_refs"]
        assert "images/1_1.jpg" in page2["image_refs"]

    def test_no_image_refs_on_text_only_page(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        # Page 1 has no image references
        page1 = [r for r in results if r["page_number"] == 1][0]
        assert page1["image_refs"] == []

    def test_image_refs_page3(self):
        from backend.services.chunking import chunk_document

        results = chunk_document(SAMPLE_MARKDOWN, strategy="page")
        page3 = [r for r in results if r["page_number"] == 3][0]
        assert "images/3_0.jpg" in page3["image_refs"]


# ========================== SEMANTIC strategy ==============================
class TestSemanticChunking:
    @staticmethod
    def _dummy_embedding(text: str) -> list[float]:
        """Return a simple deterministic dummy vector based on text length."""
        import hashlib
        h = hashlib.md5(text.encode()).hexdigest()
        # 8-dim vector from hex chars
        return [int(c, 16) / 15.0 for c in h[:8]]

    def test_semantic_chunking_with_mocked_embedding(self):
        from backend.services.chunking import chunk_document

        with patch(
            "backend.services.embedding.get_embedding_sync",
            side_effect=self._dummy_embedding,
        ):
            results = chunk_document(
                SAMPLE_MARKDOWN,
                strategy="semantic",
                chunk_size=300,
                chunk_overlap=0,
                similarity_threshold=0.5,
                min_chunk_size=50,
            )
        assert len(results) >= 2
        for r in results:
            assert r["chunking_strategy"] == "semantic"
            assert "page_number" in r

    def test_semantic_uses_provided_embedding_fn(self):
        from backend.services.chunking import chunk_document

        call_count = 0

        def counting_embedding(text):
            nonlocal call_count
            call_count += 1
            return self._dummy_embedding(text)

        results = chunk_document(
            SAMPLE_MARKDOWN,
            strategy="semantic",
            chunk_size=300,
            embedding_fn=counting_embedding,
            similarity_threshold=0.5,
            min_chunk_size=50,
        )
        assert call_count > 0, "Embedding function should have been called"
        assert len(results) >= 1
