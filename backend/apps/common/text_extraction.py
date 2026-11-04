"""Plain-text extraction from PDF and DOCX. No OCR: scanned files yield no text."""

import io
import re

import structlog
from docx import Document as DocxDocument
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .files import DOCX, PDF

log = structlog.get_logger(__name__)


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_text(data: bytes, mime_type: str) -> str:
    try:
        if mime_type == PDF:
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            return _normalise("\n\n".join(pages))
        if mime_type == DOCX:
            document = DocxDocument(io.BytesIO(data))
            parts = [p.text for p in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            return _normalise("\n".join(parts))
    except (PdfReadError, ValueError, KeyError, OSError) as exc:
        # Only the error type is logged; never file contents.
        log.warning("text_extraction_failed", mime_type=mime_type, error=type(exc).__name__)
    return ""
