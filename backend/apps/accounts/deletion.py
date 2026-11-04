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


def _known_keys(user_id: UUID | str) -> list[str]:
    owner = UUID(str(user_id))
    from apps.documents.models import DocumentVersion
    from apps.exports.models import ExportJob
    from apps.jobdescriptions.models import JobDescription

    keys = list(
        DocumentVersion.objects.filter(document__owner_id=owner).values_list(
            "storage_key", flat=True
        )
    )
    keys += (
        JobDescription.objects.filter(application__owner_id=owner)
        .exclude(original_file_key="")
        .values_list("original_file_key", flat=True)
    )
    keys += (
        ExportJob.objects.filter(owner_id=owner)
        .exclude(storage_key="")
        .values_list("storage_key", flat=True)
    )
    return keys


def delete_user_data(user_id: UUID | str) -> bool:
    storage = get_storage()
    # Keys recorded in the database, then anything else under the user's prefix.
    known = _known_keys(user_id)
    for key in known:
        storage.delete(key)
    files = len(known) + storage.delete_prefix(user_prefix(user_id))
    with transaction.atomic():
        deleted, _ = User.objects.filter(pk=user_id).delete()
    log.info("account_deleted", user_id=str(user_id), files=files, existed=bool(deleted))
    return bool(deleted)
