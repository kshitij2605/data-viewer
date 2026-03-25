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
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
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
            # Look ahead for italic caption (skip blank lines)
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j < len(lines):
                caption_match = re.match(r"^\*([^*]+)\*\s*$", lines[j].strip())
                if caption_match:
                    caption = caption_match.group(1)

            images.append({
                "image_path": image_path,
                "caption": caption,
            })
        i += 1

    return images


def extract_image_refs_from_chunk(content: str) -> List[str]:
    """Regex to find all images/X_Y.jpg references in a chunk of content."""
    return re.findall(r"images/\d+_\d+\.jpg", content)
