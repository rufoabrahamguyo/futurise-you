"""Input hygiene for AI requests."""

import re

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Phone-like runs: optional +, then 7+ digits with common separators.
PHONE = re.compile(r"(?<![\w])(?:\+?\d[\d\s().-]{6,}\d)(?![\w])")


def scrub_contact_details(text: str) -> str:
    """Removes email addresses and phone numbers (applied to CV text before sending)."""
    text = EMAIL.sub("[email removed]", text)
    return PHONE.sub(
        lambda m: "[phone removed]" if sum(c.isdigit() for c in m.group()) >= 7 else m.group(), text
    )


def truncate(text: str, max_chars: int) -> tuple[str, bool]:
    if len(text) <= max_chars:
        return text, False
    return text[:max_chars], True
