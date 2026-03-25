"""Generate and serve PDF page thumbnails."""
import fitz  # PyMuPDF
from pathlib import Path
from backend.config import settings


def generate_thumbnails(pdf_path: str, document_id: int) -> Path:
    """Generate JPEG thumbnails for each page of the PDF. Returns thumbnail directory."""
    thumb_dir = Path(settings.thumbnail_dir) / str(document_id)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
        thumb_path = thumb_dir / f"page_{page_num + 1}.jpg"
        if not thumb_path.exists():
            pix.save(str(thumb_path))
    doc.close()
    return thumb_dir


def get_thumbnail_path(document_id: int, page_num: int) -> Path:
    """Get the path to a specific page thumbnail."""
    return Path(settings.thumbnail_dir) / str(document_id) / f"page_{page_num}.jpg"
