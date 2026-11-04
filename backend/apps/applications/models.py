from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimestampedModel

from .statuses import Status


class EmploymentType(models.TextChoices):
    FULL_TIME = "full_time", "Full-time"
    PART_TIME = "part_time", "Part-time"
    CONTRACT = "contract", "Contract"
    INTERNSHIP = "internship", "Internship"
    TEMPORARY = "temporary", "Temporary"
    OTHER = "other", "Other"


class WorkArrangement(models.TextChoices):
    REMOTE = "remote", "Remote"
    HYBRID = "hybrid", "Hybrid"
    ONSITE = "onsite", "On-site"


class ApplicationQuerySet(models.QuerySet["Application"]):
    def owned_by(self, user: object) -> "ApplicationQuerySet":
        return self.filter(owner=user)

    def active(self) -> "ApplicationQuerySet":
        return self.filter(deleted_at__isnull=True)

    def trashed(self) -> "ApplicationQuerySet":
        return self.filter(deleted_at__isnull=False)


class Application(TimestampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applications"
    )
    # RESTRICT: a company cannot be deleted while applications use it, but the
    # account-deletion cascade (which removes both) is allowed.
    company = models.ForeignKey(
        "companies.Company", on_delete=models.RESTRICT, related_name="applications"
    )
    job_title = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, blank=True)
    work_arrangement = models.CharField(max_length=20, choices=WorkArrangement.choices, blank=True)
    compensation = models.CharField(max_length=200, blank=True)
    job_url = models.URLField(max_length=2000, blank=True)
    deadline = models.DateField(null=True, blank=True)
    date_applied = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SAVED)
    status_changed_at = models.DateTimeField(default=timezone.now)
    # Set the first time the application moves to Applied; marks the submission freeze.
    submitted_at = models.DateTimeField(null=True, blank=True)
    recruiter_name = models.CharField(max_length=200, blank=True)
    recruiter_email = models.EmailField(blank=True)
    recruiter_phone = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = ApplicationQuerySet.as_manager()

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "deleted_at", "status"], name="app_owner_status_idx"),
            models.Index(
                fields=["owner", "deleted_at", "-updated_at"], name="app_owner_updated_idx"
            ),
            models.Index(fields=["owner", "deadline"], name="app_owner_deadline_idx"),
            models.Index(fields=["deleted_at"], name="app_deleted_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.job_title} at {self.company_id}"

    @property
    def is_submitted(self) -> bool:
        return self.submitted_at is not None


class ApplicationQuestion(TimestampedModel):
    """A question asked by the application form and the answer the user submitted."""

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="questions")
    question = models.TextField()
    answer = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "created_at"]


class ActivityType(models.TextChoices):
    CREATED = "created", "Application created"
    STATUS_CHANGE = "status_change", "Status changed"
    SUBMITTED = "submitted", "Documents submitted"
    DOCUMENT_ATTACHED = "document_attached", "Document attached"
    DOCUMENT_REMOVED = "document_removed", "Document removed"
    JOB_DESCRIPTION = "job_description", "Job description saved"
    EXTRACTION_REVIEWED = "extraction_reviewed", "Extraction reviewed"
    INTERVIEW_PREP = "interview_prep", "Interview preparation"
    REMINDER = "reminder", "Reminder"
    RESTORED = "restored", "Restored"
    # Manually recorded activity types.
    NOTE = "note", "Note"
    FOLLOW_UP = "follow_up", "Follow-up"
    EMAIL = "email", "Email"
    CALL = "call", "Call"
    INTERVIEW = "interview", "Interview"
    ASSESSMENT = "assessment", "Assessment"
    OTHER = "other", "Other"


MANUAL_ACTIVITY_TYPES = frozenset(
    {
        ActivityType.NOTE,
        ActivityType.FOLLOW_UP,
        ActivityType.EMAIL,
        ActivityType.CALL,
        ActivityType.INTERVIEW,
        ActivityType.ASSESSMENT,
        ActivityType.OTHER,
    }
)


class ApplicationActivity(TimestampedModel):
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="activities"
    )
    type = models.CharField(max_length=30, choices=ActivityType.choices)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    is_system_generated = models.BooleanField(default=False)

    class Meta:
        ordering = ["-occurred_at", "-created_at"]
        indexes = [
            models.Index(fields=["application", "-occurred_at"], name="activity_app_time_idx"),
        ]
