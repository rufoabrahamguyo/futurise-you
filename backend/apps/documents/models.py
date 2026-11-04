"""Document library, immutable versions and application snapshots.

Immutability is enforced here, at the model layer, so every code path (API,
admin, shell, tasks) is subject to it. The only paths that remove these rows
are the purge job and account deletion, which use explicit `purge()` calls or
the database cascade.
"""

from typing import Any

from django.conf import settings
from django.db import models

from apps.common.exceptions import ImmutableRecordError
from apps.common.models import TimestampedModel, UUIDModel


class DocumentType(models.TextChoices):
    CV = "cv", "CV"
    COVER_LETTER = "cover_letter", "Cover letter"
    TRANSCRIPT = "transcript", "Transcript"
    CERTIFICATE = "certificate", "Certificate"
    PORTFOLIO = "portfolio", "Portfolio"
    OTHER = "other", "Other"


IMAGE_ALLOWED_TYPES = frozenset({DocumentType.CERTIFICATE, DocumentType.PORTFOLIO})


class Document(TimestampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="documents"
    )
    title = models.CharField(max_length=200)
    type = models.CharField(max_length=20, choices=DocumentType.choices)
    # Master documents are reusable library entries. Non-master documents were
    # uploaded for one application from its Documents tab.
    is_master = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["type", "title"]
        indexes = [models.Index(fields=["owner", "archived_at", "type"], name="doc_owner_type_idx")]

    def __str__(self) -> str:
        return self.title


class DocumentVersionQuerySet(models.QuerySet["DocumentVersion"]):
    def update(self, **kwargs: Any) -> int:
        raise ImmutableRecordError("Document versions cannot be changed.")

    def delete(self) -> tuple[int, dict[str, int]]:
        raise ImmutableRecordError("Document versions cannot be deleted.")

    def purge(self) -> tuple[int, dict[str, int]]:
        """Permanently remove rows. Only for retention cleanup and account deletion."""
        return super().delete()


class DocumentVersion(UUIDModel):
    """One uploaded file. Never changed or overwritten; each upload is a new row and key."""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    storage_key = models.CharField(max_length=300, unique=True, editable=False)
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size = models.BigIntegerField()
    sha256 = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = DocumentVersionQuerySet.as_manager()

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(fields=["document", "version_number"], name="uniq_doc_version"),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ImmutableRecordError("Document versions cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        raise ImmutableRecordError("Document versions cannot be deleted.")


class ApplicationDocumentQuerySet(models.QuerySet["ApplicationDocument"]):
    def update(self, **kwargs: Any) -> int:
        if self.filter(is_frozen=True).exists():
            raise ImmutableRecordError("Submitted documents cannot be changed.")
        return super().update(**kwargs)

    def delete(self) -> tuple[int, dict[str, int]]:
        if self.filter(is_frozen=True).exists():
            raise ImmutableRecordError("Submitted documents cannot be removed.")
        return super().delete()


class ApplicationDocument(TimestampedModel):
    """Links an application to one exact document version."""

    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="documents"
    )
    # RESTRICT keeps any referenced version alive; account deletion cascades both.
    document_version = models.ForeignKey(
        DocumentVersion, on_delete=models.RESTRICT, related_name="application_links"
    )
    role = models.CharField(max_length=20, choices=DocumentType.choices)
    is_frozen = models.BooleanField(default=False)
    frozen_at = models.DateTimeField(null=True, blank=True)
    added_after_submission = models.BooleanField(default=False)

    objects = ApplicationDocumentQuerySet.as_manager()

    class Meta:
        ordering = ["role", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["application", "document_version"], name="uniq_app_doc_version"
            ),
        ]
        indexes = [models.Index(fields=["application", "is_frozen"], name="appdoc_frozen_idx")]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            stored = (
                type(self).objects.filter(pk=self.pk).values_list("is_frozen", flat=True).first()
            )
            if stored:
                raise ImmutableRecordError("Submitted documents cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        if self.is_frozen:
            raise ImmutableRecordError("Submitted documents cannot be removed.")
        return super().delete(*args, **kwargs)
