"""Deadlines are never inferred. A date is parsed only when it is unambiguous and has a year."""

import re
from datetime import date

_MONTHS = {
    name: index
    for index, names in enumerate(
        [
            ("january", "jan"),
            ("february", "feb"),
            ("march", "mar"),
            ("april", "apr"),
            ("may",),
            ("june", "jun"),
            ("july", "jul"),
            ("august", "aug"),
            ("september", "sep", "sept"),
            ("october", "oct"),
            ("november", "nov"),
            ("december", "dec"),
        ],
        start=1,
    )
    for name in names
}
_MONTH = r"(?P<month>[A-Za-z]{3,9})\.?"
_DAY = r"(?P<day>\d{1,2})(?:st|nd|rd|th)?"
_YEAR = r"(?P<year>\d{4})"

_PATTERNS = [
    re.compile(rf"\b{_YEAR}-(?P<mnum>\d{{2}})-(?P<day>\d{{2}})\b"),
    re.compile(rf"\b{_DAY}\s+(?:of\s+)?{_MONTH},?\s+{_YEAR}\b", re.IGNORECASE),
    re.compile(rf"\b{_MONTH}\s+{_DAY},?\s+{_YEAR}\b", re.IGNORECASE),
]


def parse_deadline(text: str | None) -> date | None:
    if not text:
        return None
    found: set[date] = set()
    for pattern in _PATTERNS:
        for match in pattern.finditer(text):
            parts = match.groupdict()
            try:
                month = int(parts["mnum"]) if parts.get("mnum") else _MONTHS[parts["month"].lower()]
                found.add(date(int(parts["year"]), month, int(parts["day"])))
            except (KeyError, ValueError):
                continue
    # Two different dates (e.g. "1 May 2026 or 3 May 2026") are ambiguous.
    return found.pop() if len(found) == 1 else None
