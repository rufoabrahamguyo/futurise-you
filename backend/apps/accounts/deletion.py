"""Account deletion: the deliberate exception to immutability.

Removes every stored file under the user's prefix, then the user row; the
database cascade removes all user-owned records. Safe to run more than once.
"""

from uuid import UUID

import structlog
from django.db import transaction

from apps.common.storage import get_storage, user_prefix

from .models import User

log = structlog.get_logger(__name__)


def delete_user_data(user_id: UUID | str) -> bool:
    files = get_storage().delete_prefix(user_prefix(user_id))
    with transaction.atomic():
        deleted, _ = User.objects.filter(pk=user_id).delete()
    log.info("account_deleted", user_id=str(user_id), files=files, existed=bool(deleted))
    return bool(deleted)
