"""Application statuses. This is the single place statuses are defined.

The order matters: it drives the Kanban columns, the status menu, and rules
such as "interview prep is available from Interview onwards".
"""

from django.db import models


class Status(models.TextChoices):
    SAVED = "saved", "Saved"
    PREPARING = "preparing", "Preparing"
    APPLIED = "applied", "Applied"
    ASSESSMENT = "assessment", "Assessment"
    INTERVIEW = "interview", "Interview"
    OFFER = "offer", "Offer"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


STATUS_ORDER: list[str] = [choice.value for choice in Status]

IN_PROGRESS = frozenset({Status.PREPARING, Status.APPLIED, Status.ASSESSMENT})
CLOSED = frozenset({Status.OFFER, Status.REJECTED, Status.WITHDRAWN})


def rank(status: str) -> int:
    return STATUS_ORDER.index(status)


def is_at_or_after(status: str, threshold: str) -> bool:
    return rank(status) >= rank(threshold)
