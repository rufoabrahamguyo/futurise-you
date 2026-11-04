"""Sample uploads for tests."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from docx import Document as DocxDocument

from apps.common.pdf import blank_pdf, text_pdf

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
LEGACY_DOC_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64


def docx_bytes(*paragraphs: str) -> bytes:
    document = DocxDocument()
    for text in paragraphs:
        document.add_paragraph(text)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def pdf_upload(name: str = "cv.pdf", *lines: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name, text_pdf(list(lines) or ["Curriculum vitae"]), content_type="application/pdf"
    )


def blank_pdf_upload(name: str = "scan.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, blank_pdf(), content_type="application/pdf")


def docx_upload(name: str = "letter.docx", *paragraphs: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, docx_bytes(*(paragraphs or ("Dear team",))))


def upload(
    name: str, data: bytes, content_type: str = "application/octet-stream"
) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data, content_type=content_type)
