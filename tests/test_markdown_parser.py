"""Unit tests for markdown_parser functions."""
import pytest
from backend.services.markdown_parser import (
    extract_text_only,
    extract_tables,
    extract_images_with_captions,
    extract_image_refs_from_chunk,
)

SAMPLE_MD = """\
# Page 1 Title

Some introduction text here.

![](images/1_0.jpg)

*Caption for the first image describing what it shows.*

More text after the image.

| Header1 | Header2 |
|---------|---------|
| Cell1   | Cell2   |
| Cell3   | Cell4   |

## Section heading

---

# Page 2 Title

![](images/2_0.jpg)

*Another caption for page two image.*

Final paragraph text.
"""


class TestExtractTextOnly:
    def test_removes_image_refs(self):
        paragraphs = extract_text_only(SAMPLE_MD)
        for p in paragraphs:
            assert "![" not in p

    def test_removes_italic_captions(self):
        paragraphs = extract_text_only(SAMPLE_MD)
        for p in paragraphs:
            assert "Caption for the first image" not in p
            assert "Another caption" not in p

    def test_keeps_text_content(self):
        paragraphs = extract_text_only(SAMPLE_MD)
        all_text = "\n".join(paragraphs)
        assert "Some introduction text here." in all_text
        assert "More text after the image." in all_text
        assert "Final paragraph text." in all_text

    def test_removes_page_separators(self):
        paragraphs = extract_text_only(SAMPLE_MD)
        for p in paragraphs:
            assert p.strip() != "---"

    def test_returns_non_empty_paragraphs(self):
        paragraphs = extract_text_only(SAMPLE_MD)
        for p in paragraphs:
            assert p.strip() != ""


class TestExtractTables:
    def test_finds_tables(self):
        tables = extract_tables(SAMPLE_MD)
        assert len(tables) == 1

    def test_table_content(self):
        tables = extract_tables(SAMPLE_MD)
        assert "Header1" in tables[0]["content"]
        assert "Cell1" in tables[0]["content"]

    def test_table_description(self):
        tables = extract_tables(SAMPLE_MD)
        # The description should be the text before the table
        assert tables[0]["description"] != ""

    def test_no_tables(self):
        md = "# Title\n\nJust text, no tables.\n"
        tables = extract_tables(md)
        assert tables == []


class TestExtractImagesWithCaptions:
    def test_finds_images(self):
        images = extract_images_with_captions(SAMPLE_MD)
        assert len(images) == 2

    def test_image_paths(self):
        images = extract_images_with_captions(SAMPLE_MD)
        assert images[0]["image_path"] == "images/1_0.jpg"
        assert images[1]["image_path"] == "images/2_0.jpg"

    def test_captions(self):
        images = extract_images_with_captions(SAMPLE_MD)
        assert "Caption for the first image" in images[0]["caption"]
        assert "Another caption" in images[1]["caption"]

    def test_no_images(self):
        md = "# Title\n\nJust text.\n"
        images = extract_images_with_captions(md)
        assert images == []

    def test_image_without_caption(self):
        md = "![](images/3_0.jpg)\n\nSome regular text.\n"
        images = extract_images_with_captions(md)
        assert len(images) == 1
        assert images[0]["caption"] == ""


class TestExtractImageRefsFromChunk:
    def test_finds_refs(self):
        content = "Some text with images/1_0.jpg and images/2_3.jpg references."
        refs = extract_image_refs_from_chunk(content)
        assert refs == ["images/1_0.jpg", "images/2_3.jpg"]

    def test_no_refs(self):
        refs = extract_image_refs_from_chunk("No image references here.")
        assert refs == []

    def test_in_markdown_context(self):
        content = "![](images/4_5.jpg)\n\n*Caption*\n"
        refs = extract_image_refs_from_chunk(content)
        assert refs == ["images/4_5.jpg"]
