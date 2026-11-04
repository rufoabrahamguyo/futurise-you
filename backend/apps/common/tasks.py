import structlog
from celery import shared_task

from .storage import get_storage

log = structlog.get_logger(__name__)


@shared_task(autoretry_for=(Exception,), retry_backoff=True, max_retries=8)
def delete_storage_objects(keys: list[str]) -> int:
    """Removes stored files after their database rows are gone. Idempotent."""
    storage = get_storage()
    for key in keys:
        storage.delete(key)
    log.info("storage_objects_deleted", count=len(keys))
    return len(keys)
