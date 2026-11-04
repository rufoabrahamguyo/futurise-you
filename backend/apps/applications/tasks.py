from datetime import timedelta

import structlog
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.tasks import delete_storage_objects
from apps.documents.models import Document
from apps.documents.retention import purge_unreferenced_versions
from apps.jobdescriptions.models import JobDescription

from .models import Application

log = structlog.get_logger(__name__)


@transaction.atomic
def purge_application(application: Application) -> None:
    """Permanently deletes a soft-deleted application and files only it used."""
    document_ids = list(
        Document.objects.filter(versions__application_links__application=application)
        .values_list("pk", flat=True)
        .distinct()
    )
    jd_keys = [
        key
        for key in JobDescription.objects.filter(application=application).values_list(
            "original_file_key", flat=True
        )
        if key
    ]
    # The database cascade removes the snapshot rows, timeline, Q&A, reminders and prep.
    application.delete()
    if jd_keys:
        transaction.on_commit(lambda: delete_storage_objects.delay(jd_keys))
    purge_unreferenced_versions(document_ids)


@shared_task
def purge_deleted_applications() -> int:
    cutoff = timezone.now() - timedelta(days=settings.SOFT_DELETE_RETENTION_DAYS)
    count = 0
    for application in Application.objects.filter(deleted_at__lt=cutoff).iterator():
        purge_application(application)
        count += 1
    # Also tidy versions of documents archived long enough ago.
    purge_unreferenced_versions()
    log.info("applications_purged", count=count)
    return count
