from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.applications.models import ActivityType, Application
from apps.applications.services import record_activity, user_today
from apps.common.files import ValidatedFile
from apps.common.storage import get_storage, new_storage_key

from .models import ApplicationDocument, Document, DocumentType, DocumentVersion

NO_CV_WARNING = "no_cv"


@transaction.atomic
def freeze_submission(application: Application, *, user: User) -> list[str]:
    """Freezes every attachment the first time an application moves to Applied.

    Returns warnings for the user (for example, no CV was attached). Frozen rows
    are never unfrozen, even if the status later moves backwards.
    """
    now = timezone.now()
    links = list(
        ApplicationDocument.objects.filter(application=application, is_frozen=False)
        .select_related("document_version__document")
        .order_by("role", "created_at")
    )
    ApplicationDocument.objects.filter(pk__in=[link.pk for link in links]).update(
        is_frozen=True, frozen_at=now
    )

    application.submitted_at = now
    fields = ["submitted_at", "updated_at"]
    if application.date_applied is None:
        application.date_applied = user_today(user)
        fields.append("date_applied")
    application.save(update_fields=fields)

    files = [
        {
            "application_document_id": str(link.pk),
            "document_version_id": str(link.document_version_id),
            "role": link.role,
            "title": link.document_version.document.title,
            "filename": link.document_version.original_filename,
            "version_number": link.document_version.version_number,
            "sha256": link.document_version.sha256,
        }
        for link in links
    ]
    if files:
        lines = []
        for f in files:
            role = DocumentType(str(f["role"])).label
            lines.append(f"- {role}: {f['filename']} (version {f['version_number']})")
        body = "Submitted files:\n" + "\n".join(lines)
    else:
        body = "No files were attached when this application was submitted."
    record_activity(
        application,
        ActivityType.SUBMITTED,
        f"Submitted with {len(files)} file{'s' if len(files) != 1 else ''}",
        body=body,
        metadata={"files": files},
    )

    has_cv = any(link.role == DocumentType.CV for link in links)
    return [] if has_cv else [NO_CV_WARNING]


def _store(owner_id: object, validated: ValidatedFile) -> str:
    key = new_storage_key(str(owner_id), "documents")
    get_storage().put(key, validated.stream(), validated.mime_type)
    return key


def _create_version(document: Document, validated: ValidatedFile, number: int) -> DocumentVersion:
    key = _store(document.owner_id, validated)
    try:
        with transaction.atomic():
            return DocumentVersion.objects.create(
                document=document,
                version_number=number,
                storage_key=key,
                original_filename=validated.filename,
                mime_type=validated.mime_type,
                size=validated.size,
                sha256=validated.sha256,
            )
    except Exception:
        get_storage().delete(key)
        raise


@transaction.atomic
def create_document(
    owner: User, *, title: str, type: str, file: ValidatedFile, is_master: bool = True
) -> DocumentVersion:
    document = Document.objects.create(owner=owner, title=title, type=type, is_master=is_master)
    version = _create_version(document, file, 1)
    return version


@transaction.atomic
def add_version(document: Document, file: ValidatedFile) -> DocumentVersion:
    """Uploads a new immutable version; earlier versions are untouched."""
    locked = Document.objects.select_for_update().get(pk=document.pk)
    latest = (
        locked.versions.order_by("-version_number").values_list("version_number", flat=True).first()
    )
    Document.objects.filter(pk=locked.pk).update(updated_at=timezone.now())
    return _create_version(locked, file, (latest or 0) + 1)


@transaction.atomic
def attach_version(
    application: Application, version: DocumentVersion, role: str
) -> ApplicationDocument:
    link = ApplicationDocument.objects.create(
        application=application,
        document_version=version,
        role=role,
        added_after_submission=application.submitted_at is not None,
    )
    suffix = " (added after submission)" if link.added_after_submission else ""
    record_activity(
        application,
        ActivityType.DOCUMENT_ATTACHED,
        f"Attached {version.original_filename} (version {version.version_number}){suffix}",
        metadata={
            "document_version_id": str(version.pk),
            "role": role,
            "added_after_submission": link.added_after_submission,
        },
    )
    return link


@transaction.atomic
def detach(link: ApplicationDocument) -> None:
    """Removes an unfrozen attachment. Frozen rows raise ImmutableRecordError (409)."""
    version = link.document_version
    application = link.application
    link.delete()
    record_activity(
        application,
        ActivityType.DOCUMENT_REMOVED,
        f"Removed {version.original_filename} (version {version.version_number})",
        metadata={"document_version_id": str(version.pk)},
    )


def archive(document: Document) -> None:
    if document.archived_at is None:
        document.archived_at = timezone.now()
        document.save(update_fields=["archived_at", "updated_at"])
