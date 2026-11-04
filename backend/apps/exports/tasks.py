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
