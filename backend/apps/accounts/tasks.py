import structlog
from celery import shared_task

from .deletion import delete_user_data

log = structlog.get_logger(__name__)


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=900, max_retries=10)
def delete_account(user_id: str) -> bool:
    """Permanently deletes the user, all their records and every stored file. Retries on failure."""
    return delete_user_data(user_id)
