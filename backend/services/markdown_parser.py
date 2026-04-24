"""Parse .mmd markdown files produced by DeepSeek-OCR."""
import re
from typing import List, Dict


def extract_text_only(markdown: str) -> List[str]:
    """Strip image refs and italic captions, return non-empty text paragraphs."""
    lines = markdown.split("\n")
    result_lines: List[str] = []
    for line in lines:
        stripped = line.strip()
        # Skip image references
        if re.match(r"^!\[.*?\]\(.*?\)\s*$", stripped):
            continue
        # Skip italic captions (lines that are entirely *...*)
        if re.match(r"^\*[^*]+\*\s*$", stripped):
            continue
        # Skip page separators
        if stripped == "---":
            continue
        result_lines.append(stripped)

    # Group into paragraphs (split on blank lines)
    paragraphs: List[str] = []
    current: List[str] = []
    for line in result_lines:
        if line == "":
            if current:
                paragraphs.append("\n".join(current))
                current = []
        else:
            current.append(line)
    if current:
        paragraphs.append("\n".join(current))

    return paragraphs


def extract_tables(markdown: str) -> List[Dict]:
    """Extract markdown tables with surrounding context as descriptions."""
    lines = markdown.split("\n")
    tables: List[Dict] = []
    page_num = 1  # 1-indexed page tracking
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        # Track page boundaries
        if stripped == "---":
            page_num += 1
            i += 1
            continue
        if stripped.startswith("|") and "|" in stripped[1:]:
            # Found start of a table
            table_lines: List[str] = []
            # Look back for description
            description = ""
            for j in range(i - 1, max(i - 5, -1), -1):
                prev = lines[j].strip()
                if prev and not prev.startswith("|") and prev != "---":
                    description = prev.lstrip("#").strip()
                    break

            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1

            tables.append({
                "description": description,
                "content": "\n".join(table_lines),
                "page_number": page_num,
            })
        else:
            i += 1

    return tables


def extract_images_with_captions(markdown: str) -> List[Dict]:
    """Extract image references with their italic captions."""
    lines = markdown.split("\n")
    images: List[Dict] = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        img_match = re.match(r"^!\[.*?\]\((images/[^\)]+)\)\s*$", stripped)
        if img_match:
            image_path = img_match.group(1)
            caption = ""
            # Look ahead for caption (skip blank lines)
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j < len(lines):
                next_line = lines[j].strip()
                # Italic caption: *caption text*
                caption_match = re.match(r"^\*([^*]+)\*\s*$", next_line)
                if caption_match:
                    caption = caption_match.group(1)
                else:
                    # Blockquote chart description: > **Chart Description:** text
                    chart_match = re.match(r"^>\s*\*\*(?:Chart Description|図表説明)[:\uff1a]*\*\*\s*(.+)$", next_line)
                    if chart_match:
                        caption = chart_match.group(1).strip()

            images.append({
                "image_path": image_path,
                "caption": caption,
            })
        i += 1

    return images


def extract_table_html_map(markdown: str) -> Dict[str, str]:
    """Map table image filenames to their associated table content.

    Handles two patterns in .mmd files:
        Pattern 1 (HTML tables):
            ![](tables/11_10.jpg)

            <table>...</table>

        Pattern 2 (markdown tables, used by rag_anything):
            Some caption or description

            ![](tables/filename.jpg)

            | Column 1 | Column 2 |
            |----------|----------|
            | cell 1   | cell 2   |
    """
    mapping: Dict[str, str] = {}
    lines = markdown.split("\n")
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        # Match ![](tables/FILENAME)
        m = re.match(r"^!\[.*?\]\(tables/([^)]+)\)\s*$", stripped)
        if m:
            filename = m.group(1)
            table_lines: List[str] = []

            # Look back for description/caption text (non-empty, non-table, non-separator line)
            description = ""
            for j in range(i - 1, max(i - 5, -1), -1):
                prev = lines[j].strip()
                if prev and not prev.startswith("|") and prev != "---" and not prev.startswith("![") and not prev.startswith("<table"):
                    description = prev.lstrip("#").strip()
                    break

            # Look ahead past blank lines for table content (HTML or markdown)
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                j += 1

            if j < len(lines):
                if lines[j].strip().startswith("<table"):
                    # Collect HTML table block
                    while j < len(lines) and lines[j].strip():
                        table_lines.append(lines[j])
                        if "</table>" in lines[j]:
                            break
                        j += 1
                    mapping[filename] = "\n".join(table_lines)
                elif lines[j].strip().startswith("|"):
                    # Collect markdown table lines
                    while j < len(lines) and lines[j].strip().startswith("|"):
                        table_lines.append(lines[j].strip())
                        j += 1
                    # Build a description with the preceding text + the table
                    table_content = "\n".join(table_lines)
                    if description:
                        mapping[filename] = f"{description}\n{table_content}"
                    else:
                        mapping[filename] = table_content
        i += 1
    return mapping


def extract_image_refs_from_chunk(content: str) -> List[str]:
    """Regex to find all images/X_Y.jpg references in a chunk of content."""
    return re.findall(r"images/\d+_\d+\.jpg", content)
