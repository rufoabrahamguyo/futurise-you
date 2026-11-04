from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.applications.models import ActivityType, Application
from apps.applications.services import record_activity
from apps.common.exceptions import Conflict
from apps.common.files import ValidatedFile
from apps.common.storage import get_storage, new_storage_key
from apps.common.text_extraction import extract_text
from apps.companies.models import get_or_create_company

from .models import JobDescription, SourceType, TextSource

MAX_TEXT_CHARS = 100_000


def _ensure_absent(application: Application) -> None:
    if JobDescription.objects.filter(application=application).exists():
        raise Conflict(
            "This application already has its original job description, which can't be replaced.",
            code="job_description_exists",
        )


@transaction.atomic
def save_pasted(application: Application, text: str) -> JobDescription:
    _ensure_absent(application)
    jd = JobDescription.objects.create(
        application=application,
        source_type=SourceType.PASTE,
        original_text=text,
        text_source=TextSource.PASTE,
    )
    record_activity(
        application, ActivityType.JOB_DESCRIPTION, "Saved the job description (pasted text)"
    )
    return jd


@transaction.atomic
def save_uploaded(application: Application, file: ValidatedFile) -> JobDescription:
    _ensure_absent(application)
    key = new_storage_key(str(application.owner_id))
    text = extract_text(file.data, file.mime_type)[:MAX_TEXT_CHARS]
    get_storage().put(key, file.stream(), file.mime_type)
    try:
        with transaction.atomic():
            jd = JobDescription.objects.create(
                application=application,
                source_type=SourceType.UPLOAD,
                original_text=text,
                text_source=TextSource.FILE if text else "",
                original_file_key=key,
                original_filename=file.filename,
                original_file_mime=file.mime_type,
                original_file_size=file.size,
                original_file_sha256=file.sha256,
            )
    except Exception:
        get_storage().delete(key)
        raise
    record_activity(
        application,
        ActivityType.JOB_DESCRIPTION,
        f"Saved the job description ({file.filename})",
        metadata={"has_text": bool(text)},
    )
    return jd


@transaction.atomic
def supplement_text(jd: JobDescription, text: str) -> JobDescription:
    """Adds pasted text once, only when the uploaded file had no extractable text."""
    jd = JobDescription.objects.select_for_update().get(pk=jd.pk)
    if jd.has_text:
        raise Conflict(
            "The original job description text can't be changed.", code="immutable_record"
        )
    jd.original_text = text
    jd.text_source = TextSource.PASTE_SUPPLEMENT
    jd.save(update_fields=["original_text", "text_source", "updated_at"])
    record_activity(
        jd.application, ActivityType.JOB_DESCRIPTION, "Added the job description text (pasted)"
    )
    return jd


APPLICATION_FIELDS = (
    "job_title",
    "location",
    "employment_type",
    "work_arrangement",
    "compensation",
    "deadline",
)


@transaction.atomic
def approve_review(jd: JobDescription, data: dict[str, Any]) -> JobDescription:
    """Saves the user's reviewed data and only now copies it onto the application."""
    jd = (
        JobDescription.objects.select_for_update()
        .select_related("application__company")
        .get(pk=jd.pk)
    )
    application = jd.application
    payload = {**data, "deadline": data["deadline"].isoformat() if data.get("deadline") else None}
    jd.reviewed_data = payload
    jd.reviewed_at = timezone.now()
    jd.save(update_fields=["reviewed_data", "reviewed_at", "updated_at"])

    changed: list[str] = []
    for field in APPLICATION_FIELDS:
        value = data.get(field)
        if value and getattr(application, field) != value:
            setattr(application, field, value)
            changed.append(field)
    if data.get("company") and data["company"].lower() != application.company.name.lower():
        application.company = get_or_create_company(application.owner, data["company"])
        changed.append("company")
    if changed:
        application.save()
    record_activity(
        application,
        ActivityType.EXTRACTION_REVIEWED,
        "Reviewed and approved the job description details",
        metadata={"updated_fields": changed},
    )
    return jd
