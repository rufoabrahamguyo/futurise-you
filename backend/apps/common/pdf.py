"""Builds small text-only PDFs (used for demo data and tests)."""

import textwrap


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text_pdf(lines: list[str], *, title: str = "") -> bytes:
    wrapped: list[str] = []
    for line in lines:
        wrapped.extend(textwrap.wrap(line, 92) or [""])
    wrapped = wrapped[:56]
    ascii_lines = [line.encode("latin-1", "replace").decode("latin-1") for line in wrapped]
    body = (
        "BT /F1 10.5 Tf 14 TL 60 790 Td "
        + " ".join(f"({_escape(t)}) Tj T*" for t in ascii_lines)
        + " ET"
    )
    stream = body.encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        f"<< /Title ({_escape(title)}) >>".encode("latin-1", "replace"),
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def blank_pdf() -> bytes:
    """A valid PDF with no text layer, like a scanned document."""
    return text_pdf([])
