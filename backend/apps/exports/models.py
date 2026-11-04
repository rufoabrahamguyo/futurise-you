from django.conf import settings
from django.db import models

from apps.common.models import AsyncStatus, TimestampedModel


class ExportJob(TimestampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exports"
    )
    status = models.CharField(
        max_length=20, choices=AsyncStatus.choices, default=AsyncStatus.QUEUED
    )
    storage_key = models.CharField(max_length=300, blank=True, editable=False)
    size = models.BigIntegerField(null=True, blank=True)
    error = models.CharField(max_length=60, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
