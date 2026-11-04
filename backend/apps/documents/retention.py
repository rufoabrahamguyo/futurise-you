"""Removes files nobody can reach any more. See DECISIONS D-008."""

from collections.abc import Iterable
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from apps.common.tasks import delete_storage_objects

from .models import ApplicationDocument, Document, DocumentVersion


def _schedule_storage_delete(keys: list[str]) -> None:
    if keys:
        transaction.on_commit(lambda: delete_storage_objects.delay(keys))


def purge_unreferenced_versions(document_ids: Iterable[UUID] | None = None) -> int:
    """Deletes versions no application uses, for documents that are no longer in the library.

    A version stays while its document is a live library document, or while any
    application references it. Documents archived less than the retention period
    ago are left alone.
    """
    cutoff = timezone.now() - timedelta(days=settings.SOFT_DELETE_RETENTION_DAYS)
    documents = Document.objects.filter(Q(archived_at__lt=cutoff) | Q(is_master=False))
    if document_ids is not None:
        documents = documents.filter(pk__in=list(document_ids))
    versions = DocumentVersion.objects.filter(document__in=documents).filter(
        ~Exists(ApplicationDocument.objects.filter(document_version=OuterRef("pk")))
    )
    keys = list(versions.values_list("storage_key", flat=True))
    if not keys:
        return 0
    with transaction.atomic():
        versions.purge()
        Document.objects.filter(pk__in=documents.values("pk")).filter(
            versions__isnull=True
        ).delete()
        _schedule_storage_delete(keys)
    return len(keys)
