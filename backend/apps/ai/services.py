"""AI workflows. User data is always saved before any AI call, and an AI
failure only changes the job's status: it never touches the user's data."""

from functools import partial
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.applications.models import Application
from apps.applications.statuses import Status, is_at_or_after
from apps.common.exceptions import Conflict
from apps.documents.models import ApplicationDocument, DocumentType
from apps.jobdescriptions.models import ExtractionStatus, JobDescription

from .models import AIFeature, InterviewPreparation
from .usage import consume


@transaction.atomic
def queue_extraction(jd: JobDescription, user: User) -> JobDescription:
    from .tasks import extract_job_description

    jd = JobDescription.objects.select_for_update().get(pk=jd.pk)
    if not jd.has_text:
        raise ValidationError(
            {"text": ["This job description has no text yet. Paste the text first."]},
            code="no_text",
        )
    if jd.extraction_status in (ExtractionStatus.QUEUED, ExtractionStatus.PROCESSING):
        return jd
    consume(user, AIFeature.EXTRACTION)
    jd.extraction_status = ExtractionStatus.QUEUED
    jd.extraction_error = ""
    jd.save(update_fields=["extraction_status", "extraction_error", "updated_at"])
    transaction.on_commit(partial(extract_job_description.delay, str(jd.pk)))
    return jd


def prep_inputs(application: Application) -> tuple[dict[str, Any], list[str]]:
    """Which saved records feed interview prep, and which are missing."""
    jd = JobDescription.objects.filter(application=application).first()
    frozen = {
        link.role: link
        for link in ApplicationDocument.objects.filter(application=application, is_frozen=True)
        .select_related("document_version")
        .order_by("created_at")
    }
    refs: dict[str, Any] = {
        "job_description_id": str(jd.pk) if jd and jd.has_text else None,
        "reviewed": bool(jd and jd.reviewed_data),
        "cv_version_id": str(frozen[DocumentType.CV].document_version_id)
        if DocumentType.CV in frozen
        else None,
        "cover_letter_version_id": (
            str(frozen[DocumentType.COVER_LETTER].document_version_id)
            if DocumentType.COVER_LETTER in frozen
            else None
        ),
    }
    missing = [
        name
        for name, present in (
            ("job_description", refs["job_description_id"]),
            ("approved_requirements", refs["reviewed"]),
            ("submitted_cv", refs["cv_version_id"]),
            ("submitted_cover_letter", refs["cover_letter_version_id"]),
        )
        if not present
    ]
    return refs, missing


@transaction.atomic
def queue_interview_prep(application: Application, user: User) -> InterviewPreparation:
    from .tasks import generate_interview_prep

    if not is_at_or_after(application.status, Status.INTERVIEW):
        raise Conflict(
            "Interview preparation becomes available when the application reaches Interview.",
            code="prep_not_available",
        )
    refs, missing = prep_inputs(application)
    if refs["job_description_id"] is None and refs["cv_version_id"] is None:
        raise ValidationError(
            {"inputs": ["Save the job description or attach your submitted CV first."]},
            code="prep_no_inputs",
        )
    consume(user, AIFeature.INTERVIEW_PREP)
    prep = InterviewPreparation.objects.create(
        application=application, input_references=refs, missing_inputs=missing
    )
    transaction.on_commit(partial(generate_interview_prep.delay, str(prep.pk)))
    return prep


@transaction.atomic
def retry_interview_prep(prep: InterviewPreparation, user: User) -> InterviewPreparation:
    from .tasks import generate_interview_prep

    prep = InterviewPreparation.objects.select_for_update().get(pk=prep.pk)
    if prep.status != "failed":
        return prep
    consume(user, AIFeature.INTERVIEW_PREP)
    prep.status = "queued"
    prep.error = ""
    prep.save(update_fields=["status", "error", "updated_at"])
    transaction.on_commit(partial(generate_interview_prep.delay, str(prep.pk)))
    return prep
