"""Application workflows. Views call these; they hold the business rules."""

import zoneinfo
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User

from .models import ActivityType, Application, ApplicationActivity
from .statuses import Status


def user_today(user: User) -> date:
    try:
        tz = zoneinfo.ZoneInfo(user.timezone)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        tz = zoneinfo.ZoneInfo("UTC")
    return timezone.now().astimezone(tz).date()


def record_activity(
    application: Application,
    type: str,
    title: str,
    *,
    body: str = "",
    metadata: dict[str, Any] | None = None,
    system: bool = True,
) -> ApplicationActivity:
    activity = ApplicationActivity.objects.create(
        application=application,
        type=type,
        title=title[:255],
        body=body,
        metadata=metadata or {},
        is_system_generated=system,
    )
    # Touch the application so "recently updated" reflects timeline changes.
    Application.objects.filter(pk=application.pk).update(updated_at=timezone.now())
    return activity


def create_application(owner: User, **fields: Any) -> Application:
    application = Application.objects.create(owner=owner, **fields)
    record_activity(
        application,
        ActivityType.CREATED,
        f"Added {application.job_title} at {application.company.name}",
    )
    return application


@dataclass
class StatusChangeResult:
    application: Application
    changed: bool
    warnings: list[str] = field(default_factory=list)


@transaction.atomic
def change_status(
    application: Application, new_status: str, *, user: User, note: str = ""
) -> StatusChangeResult:
    from apps.documents.services import freeze_submission

    application = Application.objects.select_for_update().get(pk=application.pk)
    old_status = application.status
    if old_status == new_status:
        return StatusChangeResult(application, changed=False)

    application.status = new_status
    application.status_changed_at = timezone.now()
    application.save(update_fields=["status", "status_changed_at", "updated_at"])
    record_activity(
        application,
        ActivityType.STATUS_CHANGE,
        f"Status changed from {Status(old_status).label} to {Status(new_status).label}",
        body=note,
        metadata={"from": old_status, "to": new_status},
    )

    warnings: list[str] = []
    if new_status == Status.APPLIED and application.submitted_at is None:
        warnings = freeze_submission(application, user=user)
    application.refresh_from_db()
    return StatusChangeResult(application, changed=True, warnings=warnings)


def soft_delete(application: Application) -> None:
    application.deleted_at = timezone.now()
    application.save(update_fields=["deleted_at", "updated_at"])


def restore(application: Application) -> None:
    application.deleted_at = None
    application.save(update_fields=["deleted_at", "updated_at"])
    record_activity(application, ActivityType.RESTORED, "Restored from trash")
