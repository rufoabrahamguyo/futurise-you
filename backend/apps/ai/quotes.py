"""Server-side check that every extracted value is supported by an exact quote."""

import re
from typing import Any

from .schemas import LIST_FIELDS, SCALAR_FIELDS, ExtractionOutput, Quoted

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WS.sub(" ", text).strip()


def _supported(item: Quoted, source: str) -> bool:
    return bool(normalize(item.quote)) and normalize(item.quote) in source


def verify(
    output: ExtractionOutput, source_text: str
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Returns the output with unsupported values replaced by null (or dropped from lists),
    plus a list of what was discarded."""
    source = normalize(source_text)
    verified: dict[str, Any] = {}
    discarded: list[dict[str, str]] = []
    for field in SCALAR_FIELDS:
        item: Quoted | None = getattr(output, field)
        if item is None:
            verified[field] = None
        elif _supported(item, source):
            verified[field] = item.model_dump()
        else:
            verified[field] = None
            discarded.append({"field": field, "value": item.value, "reason": "quote_not_found"})
    for field in LIST_FIELDS:
        kept = []
        for item in getattr(output, field):
            if _supported(item, source):
                kept.append(item.model_dump())
            else:
                discarded.append({"field": field, "value": item.value, "reason": "quote_not_found"})
        verified[field] = kept
    return verified, discarded
