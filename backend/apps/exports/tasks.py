import structlog
from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.common.tasks import delete_storage_objects

from .models import ExportJob

log = structlog.get_logger(__name__)


@shared_task
def purge_expired_exports() -> int:
    expired = ExportJob.objects.filter(expires_at__lt=timezone.now())
    keys = [k for k in expired.values_list("storage_key", flat=True) if k]
    with transaction.atomic():
        count, _ = expired.delete()
        if keys:
            transaction.on_commit(lambda: delete_storage_objects.delay(keys))
    log.info("exports_purged", count=count)
    return count


@shared_task(autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def build_export_job(export_id: str) -> str:
    from datetime import timedelta

    from django.conf import settings

    from apps.common.storage import get_storage, new_storage_key
    from apps.reminders.models import Notification, NotificationKind

    from .builder import build_export

    job = ExportJob.objects.select_related("owner").filter(pk=export_id).first()
    if job is None or job.status not in ("queued", "processing"):
        return "skipped"
    ExportJob.objects.filter(pk=job.pk).update(status="processing", updated_at=timezone.now())
    key = new_storage_key(job.owner_id)
    try:
        archive = build_export(job.owner)
        try:
            size = archive.seek(0, 2)
            archive.seek(0)
            get_storage().put(key, archive, "application/zip")
        finally:
            archive.close()
    except Exception:
        ExportJob.objects.filter(pk=job.pk).update(
            status="failed", error="build_failed", updated_at=timezone.now()
        )
        log.exception("export_failed", export_id=str(job.pk), user_id=str(job.owner_id))
        raise
    now = timezone.now()
    with transaction.atomic():
        ExportJob.objects.filter(pk=job.pk).update(
            status="succeeded",
            storage_key=key,
            size=size,
            completed_at=now,
            expires_at=now + timedelta(hours=settings.EXPORT_LINK_TTL_HOURS),
            error="",
            updated_at=now,
        )
        Notification.objects.create(
            owner=job.owner,
            kind=NotificationKind.EXPORT,
            title="Your data export is ready",
            body=f"Download it from Settings within {settings.EXPORT_LINK_TTL_HOURS} hours.",
            link="/settings#export",
        )
    log.info("export_succeeded", export_id=str(job.pk), size=size)
    return "succeeded"
