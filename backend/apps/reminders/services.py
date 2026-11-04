from django.db import transaction
from django.utils import timezone

from apps.applications.models import ActivityType
from apps.applications.services import record_activity

from .models import Reminder, ReminderStatus, ReminderType

OPEN = (ReminderStatus.PENDING, ReminderStatus.SENT)


@transaction.atomic
def complete(reminder: Reminder) -> Reminder:
    reminder = Reminder.objects.select_for_update().get(pk=reminder.pk)
    if reminder.status in OPEN:
        reminder.status = ReminderStatus.COMPLETED
        reminder.completed_at = timezone.now()
        reminder.save(update_fields=["status", "completed_at", "updated_at"])
        if reminder.type != ReminderType.FOLLOW_UP:
            # Follow-ups prompt the user to record what happened instead.
            record_activity(
                reminder.application,
                ActivityType.REMINDER,
                f"Completed reminder: {reminder.title}",
                metadata={"reminder_id": str(reminder.pk), "reminder_type": reminder.type},
            )
    return reminder


@transaction.atomic
def cancel(reminder: Reminder) -> Reminder:
    reminder = Reminder.objects.select_for_update().get(pk=reminder.pk)
    if reminder.status in OPEN:
        reminder.status = ReminderStatus.CANCELLED
        reminder.cancelled_at = timezone.now()
        reminder.save(update_fields=["status", "cancelled_at", "updated_at"])
    return reminder
