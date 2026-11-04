"""Upload validation: file type is checked by content as well as extension."""

import hashlib
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from typing import IO

from django.conf import settings
from rest_framework.exceptions import ValidationError

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PNG = "image/png"
JPEG = "image/jpeg"

_EXTENSIONS = {".pdf": PDF, ".docx": DOCX, ".png": PNG, ".jpg": JPEG, ".jpeg": JPEG}
IMAGE_TYPES = frozenset({PNG, JPEG})
PREVIEWABLE = frozenset({PDF, PNG, JPEG})

LEGACY_DOC_MESSAGE = (
    "Legacy Word files (.doc) aren't supported. Save the file as .docx or PDF and upload it again."
)


@dataclass(frozen=True)
class ValidatedFile:
    data: bytes
    mime_type: str
    filename: str
    size: int
    sha256: str

    def stream(self) -> IO[bytes]:
        return io.BytesIO(self.data)


def sanitize_filename(name: str, *, default_ext: str = "") -> str:
    """A safe display name: no paths, control characters or odd whitespace."""
    name = unicodedata.normalize("NFC", name or "")
    name = re.split(r"[\\/]", name)[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C")
    name = re.sub(r"\s+", " ", name).strip(" .")
    name = re.sub(r'[<>:"|?*]', "_", name)
    if not name:
        name = f"document{default_ext}"
    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        name = f"{stem[: 200 - len(ext) - 1]}.{ext}" if dot and len(ext) <= 10 else name[:200]
    return name


def _sniff(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return PDF
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "legacy-ole"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
        except zipfile.BadZipFile:
            return None
        if "[Content_Types].xml" in names and "word/document.xml" in names:
            return DOCX
    return None


def read_upload(fileobj: IO[bytes]) -> bytes:
    """Reads at most one byte past the limit so oversized files are rejected cheaply."""
    data = fileobj.read(settings.MAX_UPLOAD_BYTES + 1)
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise ValidationError({"file": ["Files must be 10 MB or smaller."]}, code="file_too_large")
    return data


def validate_file(data: bytes, filename: str, *, allow_images: bool) -> ValidatedFile:
    if not data:
        raise ValidationError({"file": ["This file is empty."]}, code="file_empty")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise ValidationError({"file": ["Files must be 10 MB or smaller."]}, code="file_too_large")

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    detected = _sniff(data)
    if ext == ".doc" or detected == "legacy-ole":
        raise ValidationError({"file": [LEGACY_DOC_MESSAGE]}, code="legacy_doc")

    allowed = "PDF, DOCX, PNG or JPG" if allow_images else "PDF or DOCX"
    expected = _EXTENSIONS.get(ext)
    if expected is None or (expected in IMAGE_TYPES and not allow_images):
        raise ValidationError({"file": [f"Upload a {allowed} file."]}, code="file_type")
    if detected != expected:
        raise ValidationError(
            {
                "file": [
                    f"This file's contents don't match its {ext} extension. "
                    f"Upload a {allowed} file."
                ]
            },
            code="file_content_mismatch",
        )
    return ValidatedFile(
        data=data,
        mime_type=expected,
        filename=sanitize_filename(filename, default_ext=ext),
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )
