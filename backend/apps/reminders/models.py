from django.conf import settings
from django.db import models

from apps.common.models import TimestampedModel


class ReminderType(models.TextChoices):
    DEADLINE = "deadline", "Deadline"
    FOLLOW_UP = "follow_up", "Follow-up"
    INTERVIEW = "interview", "Interview"
    ASSESSMENT = "assessment", "Assessment"
    RECRUITER_RESPONSE = "recruiter_response", "Recruiter response"
    OTHER = "other", "Other"


class ReminderStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class Channel(models.TextChoices):
    IN_APP = "in_app", "In-app"
    EMAIL = "email", "Email"


def default_channels() -> list[str]:
    return [Channel.IN_APP.value, Channel.EMAIL.value]


class Reminder(TimestampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders"
    )
    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="reminders"
    )
    type = models.CharField(max_length=30, choices=ReminderType.choices)
    title = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    remind_at = models.DateTimeField(help_text="Stored in UTC.")
    channels = models.JSONField(default=default_channels)
    status = models.CharField(
        max_length=20, choices=ReminderStatus.choices, default=ReminderStatus.PENDING
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["remind_at"]
        indexes = [
            models.Index(fields=["status", "remind_at"], name="reminder_due_idx"),
            models.Index(fields=["owner", "status", "remind_at"], name="reminder_owner_idx"),
        ]


class NotificationKind(models.TextChoices):
    REMINDER = "reminder", "Reminder"
    EXPORT = "export", "Export ready"


class Notification(TimestampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    # One notification per reminder at most: the unique constraint is what makes
    # concurrent dispatch and email retries unable to create duplicates.
    reminder = models.OneToOneField(
        Reminder, on_delete=models.CASCADE, null=True, blank=True, related_name="notification"
    )
    kind = models.CharField(max_length=20, choices=NotificationKind.choices)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "read_at"], name="notification_unread_idx")]
