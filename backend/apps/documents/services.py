from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.applications.models import ActivityType, Application
from apps.applications.services import record_activity, user_today

from .models import ApplicationDocument, DocumentType

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
