"""FR-06: upload validation by content and extension, size limit, filename handling."""

import pytest
from rest_framework.exceptions import ValidationError

from apps.common.files import sanitize_filename, validate_file
from apps.common.pdf import text_pdf
from tests.files import JPEG_BYTES, LEGACY_DOC_BYTES, PNG_BYTES, docx_bytes


def _code(exc: pytest.ExceptionInfo[ValidationError]) -> str:
    return exc.value.get_codes()["file"][0]  # type: ignore[index]


def test_accepts_pdf_and_docx_by_content() -> None:
    assert (
        validate_file(text_pdf(["x"]), "cv.pdf", allow_images=False).mime_type == "application/pdf"
    )
    docx = validate_file(docx_bytes("Hi"), "letter.DOCX", allow_images=False)
    assert docx.mime_type.endswith("wordprocessingml.document")
    assert len(docx.sha256) == 64


def test_images_only_where_allowed() -> None:
    assert validate_file(PNG_BYTES, "cert.png", allow_images=True).mime_type == "image/png"
    assert validate_file(JPEG_BYTES, "cert.jpeg", allow_images=True).mime_type == "image/jpeg"
    with pytest.raises(ValidationError) as exc:
        validate_file(PNG_BYTES, "cv.png", allow_images=False)
    assert _code(exc) == "file_type"


def test_rejects_legacy_doc_with_clear_message() -> None:
    for data, name in [
        (LEGACY_DOC_BYTES, "cv.doc"),
        (LEGACY_DOC_BYTES, "renamed.pdf"),
        (b"anything", "cv.doc"),
    ]:
        with pytest.raises(ValidationError) as exc:
            validate_file(data, name, allow_images=False)
        assert _code(exc) == "legacy_doc"
        assert ".docx or PDF" in str(exc.value.detail["file"][0])  # type: ignore[index]


def test_rejects_content_that_does_not_match_extension() -> None:
    for data, name in [
        (PNG_BYTES, "cv.pdf"),
        (text_pdf(["x"]), "cv.docx"),
        (b"PK\x03\x04junk", "cv.docx"),
        (b"<html>", "cv.pdf"),
    ]:
        with pytest.raises(ValidationError) as exc:
            validate_file(data, name, allow_images=True)
        assert _code(exc) == "file_content_mismatch"


def test_rejects_unknown_types_empty_and_oversized(settings) -> None:
    with pytest.raises(ValidationError):
        validate_file(b"hello", "notes.txt", allow_images=True)
    with pytest.raises(ValidationError) as exc:
        validate_file(b"", "cv.pdf", allow_images=False)
    assert _code(exc) == "file_empty"
    settings.MAX_UPLOAD_BYTES = 100
    with pytest.raises(ValidationError) as exc:
        validate_file(b"%PDF-" + b"0" * 200, "cv.pdf", allow_images=False)
    assert _code(exc) == "file_too_large"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd.pdf", "passwd.pdf"),
        ("C:\\Users\\me\\My CV.pdf", "My CV.pdf"),
        ("cv\x00\x07name.pdf", "cvname.pdf"),
        ('a<b>:"c|?*.pdf', "a_b___c___.pdf"),
        ("   ", "document.pdf"),
        ("x" * 300 + ".pdf", "x" * 196 + ".pdf"),
    ],
)
def test_sanitize_filename(raw: str, expected: str) -> None:
    assert sanitize_filename(raw, default_ext=".pdf") == expected
