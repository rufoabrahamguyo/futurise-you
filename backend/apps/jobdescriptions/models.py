"""The job description record.

The original text and file are write-once (see DECISIONS D-005). AI output and
the user's reviewed data are stored separately so the UI can show which is which.
"""

from typing import Any

from django.db import models

from apps.common.exceptions import ImmutableRecordError
from apps.common.models import TimestampedModel


class SourceType(models.TextChoices):
    PASTE = "paste", "Pasted text"
    UPLOAD = "upload", "Uploaded file"


class TextSource(models.TextChoices):
    PASTE = "paste", "Pasted by you"
    FILE = "file", "Extracted from the uploaded file"
    PASTE_SUPPLEMENT = "paste_supplement", "Pasted by you (file had no text)"


class ExtractionStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not started"
    QUEUED = "queued", "Queued"
    PROCESSING = "processing", "Processing"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"


_WRITE_ONCE_FILE_FIELDS = (
    "source_type",
    "original_file_key",
    "original_filename",
    "original_file_mime",
    "original_file_size",
    "original_file_sha256",
)


class JobDescription(TimestampedModel):
    application = models.OneToOneField(
        "applications.Application", on_delete=models.CASCADE, related_name="job_description"
    )
    source_type = models.CharField(max_length=10, choices=SourceType.choices)
    original_text = models.TextField(blank=True)
    text_source = models.CharField(max_length=20, choices=TextSource.choices, blank=True)
    original_file_key = models.CharField(max_length=300, blank=True, editable=False)
    original_filename = models.CharField(max_length=255, blank=True)
    original_file_mime = models.CharField(max_length=100, blank=True)
    original_file_size = models.BigIntegerField(null=True, blank=True)
    original_file_sha256 = models.CharField(max_length=64, blank=True)

    extraction_status = models.CharField(
        max_length=20, choices=ExtractionStatus.choices, default=ExtractionStatus.NOT_STARTED
    )
    extraction_error = models.CharField(max_length=60, blank=True)
    extraction_started_at = models.DateTimeField(null=True, blank=True)
    extracted_at = models.DateTimeField(null=True, blank=True)
    raw_ai_output = models.JSONField(null=True, blank=True)
    reviewed_data = models.JSONField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    @property
    def has_text(self) -> bool:
        return bool(self.original_text.strip())

    @property
    def has_file(self) -> bool:
        return bool(self.original_file_key)

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            stored = (
                type(self)
                .objects.filter(pk=self.pk)
                .values("original_text", *_WRITE_ONCE_FILE_FIELDS)
                .first()
            )
            if stored is not None:
                for field in _WRITE_ONCE_FILE_FIELDS:
                    if getattr(self, field) != stored[field]:
                        raise ImmutableRecordError(
                            "The original job description cannot be changed."
                        )
                # Text can be supplied once, only when the uploaded file had none.
                if stored["original_text"] and self.original_text != stored["original_text"]:
                    raise ImmutableRecordError("The original job description cannot be changed.")
        super().save(*args, **kwargs)
