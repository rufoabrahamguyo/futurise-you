from django.conf import settings
from django.db import models

from apps.common.models import AsyncStatus, TimestampedModel


class AIFeature(models.TextChoices):
    EXTRACTION = "extraction", "Job description extraction"
    INTERVIEW_PREP = "interview_prep", "Interview preparation"


class AIUsage(models.Model):
    """One row per AI request; counts toward the per-user daily limit."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_usage"
    )
    feature = models.CharField(max_length=20, choices=AIFeature.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["owner", "created_at"], name="aiusage_owner_time_idx")]

    def __str__(self) -> str:
        return f"{self.feature} at {self.created_at}"


class InterviewPreparation(TimestampedModel):
    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="interview_preps"
    )
    status = models.CharField(
        max_length=20, choices=AsyncStatus.choices, default=AsyncStatus.QUEUED
    )
    content = models.JSONField(null=True, blank=True)
    # IDs of the exact records used as input, and which inputs were missing.
    input_references = models.JSONField(default=dict, blank=True)
    missing_inputs = models.JSONField(default=list, blank=True)
    user_notes = models.TextField(blank=True)
    error = models.CharField(max_length=60, blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    prompt_version = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["-created_at"]
