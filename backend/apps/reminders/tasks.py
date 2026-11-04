import zoneinfo
from functools import partial

import structlog
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Channel, Notification, NotificationKind, Reminder, ReminderStatus

log = structlog.get_logger(__name__)


def _local_time(reminder: Reminder) -> str:
    tz = zoneinfo.ZoneInfo(reminder.owner.timezone or "UTC")
    return reminder.remind_at.astimezone(tz).strftime("%a %d %b %Y, %H:%M %Z")


@shared_task
def dispatch_due_reminders(batch_size: int = 200) -> int:
    """Claims due reminders and notifies their owners.

    Rows are claimed with SELECT … FOR UPDATE SKIP LOCKED, so concurrent workers
    each get different reminders and none is sent twice. The notification has a
    unique constraint on the reminder as a second guard.
    """
    now = timezone.now()
    with transaction.atomic():
        due = list(
            Reminder.objects.select_for_update(skip_locked=True, of=("self",))
            .filter(
                status=ReminderStatus.PENDING,
                remind_at__lte=now,
                application__deleted_at__isnull=True,
            )
            .select_related("owner", "application__company")
            .order_by("remind_at")[:batch_size]
        )
        for reminder in due:
            reminder.status = ReminderStatus.SENT
            reminder.sent_at = now
            reminder.save(update_fields=["status", "sent_at", "updated_at"])
            app = reminder.application
            Notification.objects.get_or_create(
                reminder=reminder,
                defaults={
                    "owner": reminder.owner,
                    "kind": NotificationKind.REMINDER,
                    "title": reminder.title,
                    "body": f"{app.job_title} at {app.company.name}",
                    "link": f"/applications/{app.pk}?tab=reminders",
                },
            )
            user = reminder.owner
            if (
                Channel.EMAIL in reminder.channels
                and user.email_notifications
                and user.is_email_verified
                and user.is_active
            ):
                transaction.on_commit(partial(send_reminder_email.delay, str(reminder.pk)))
    if due:
        log.info("reminders_dispatched", count=len(due))
    return len(due)


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=600, max_retries=6)
def send_reminder_email(reminder_id: str) -> bool:
    """Sends the reminder email once. Retries never create another notification."""
    with transaction.atomic():
        reminder = (
            Reminder.objects.select_for_update(of=("self",))
            .select_related("owner", "application__company")
            .filter(pk=reminder_id)
            .first()
        )
        if reminder is None or reminder.email_sent_at is not None:
            return False
        if reminder.status == ReminderStatus.CANCELLED:
            return False
        app = reminder.application
        body = render_to_string(
            "emails/reminder.txt",
            {
                "reminder": reminder,
                "application": app,
                "when": _local_time(reminder),
                "link": f"{settings.FRONTEND_URL}/applications/{app.pk}?tab=reminders",
            },
        )
        send_mail(
            f"Reminder: {reminder.title}",
            body,
            settings.DEFAULT_FROM_EMAIL,
            [reminder.owner.email],
        )
        reminder.email_sent_at = timezone.now()
        reminder.save(update_fields=["email_sent_at", "updated_at"])
    log.info("reminder_email_sent", reminder_id=reminder_id)
    return True
