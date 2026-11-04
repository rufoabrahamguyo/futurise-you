"""Celery tasks for AI work. Visible states: queued → processing → succeeded | failed."""

import time

import structlog
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.applications.models import ActivityType
from apps.applications.services import record_activity
from apps.common.storage import get_storage
from apps.common.text_extraction import extract_text
from apps.documents.models import DocumentVersion
from apps.jobdescriptions.models import ExtractionStatus, JobDescription

from . import prompts
from .deadlines import parse_deadline
from .models import InterviewPreparation
from .providers import ProviderError, get_provider
from .quotes import verify
from .runner import InvalidModelOutput, run_structured
from .safety import scrub_contact_details, truncate
from .schemas import ExtractionOutput, InterviewPrepOutput

log = structlog.get_logger(__name__)


def _error_code(exc: Exception) -> str:
    if isinstance(exc, InvalidModelOutput):
        return "invalid_output"
    if isinstance(exc, ProviderError):
        return "provider_unavailable"
    return "unexpected_error"


@shared_task(acks_late=True)
def extract_job_description(job_description_id: str) -> str:
    with transaction.atomic():
        jd = JobDescription.objects.select_for_update().filter(pk=job_description_id).first()
        if jd is None or jd.extraction_status not in (
            ExtractionStatus.QUEUED,
            ExtractionStatus.PROCESSING,
        ):
            return "skipped"
        jd.extraction_status = ExtractionStatus.PROCESSING
        jd.extraction_started_at = timezone.now()
        jd.save(update_fields=["extraction_status", "extraction_started_at", "updated_at"])

    started = time.monotonic()
    provider = get_provider()
    text, truncated = truncate(jd.original_text, settings.AI_MAX_JD_CHARS)
    try:
        system, user = prompts.extraction_messages(text)
        result = run_structured(provider, system, user, ExtractionOutput, task="extraction")
        verified, discarded = verify(result.data, jd.original_text)
        if verified["deadline"]:
            parsed = parse_deadline(verified["deadline"]["value"])
            verified["deadline"]["parsed_date"] = parsed.isoformat() if parsed else None
    except Exception as exc:
        # Only the status changes; the original job description and any reviewed data are untouched.
        code = _error_code(exc)
        JobDescription.objects.filter(pk=jd.pk).update(
            extraction_status=ExtractionStatus.FAILED,
            extraction_error=code,
            updated_at=timezone.now(),
        )
        log.warning(
            "extraction_failed",
            job_description_id=str(jd.pk),
            application_id=str(jd.application_id),
            error=code,
            provider=provider.name,
        )
        if code == "unexpected_error":
            log.exception("extraction_unexpected_error", job_description_id=str(jd.pk))
        return ExtractionStatus.FAILED

    JobDescription.objects.filter(pk=jd.pk).update(
        extraction_status=ExtractionStatus.SUCCEEDED,
        extraction_error="",
        extracted_at=timezone.now(),
        raw_ai_output={
            "model": result.model,
            "prompt_version": prompts.EXTRACTION_PROMPT_VERSION,
            "output": verified,
            "discarded": discarded,
            "truncated": truncated,
            "retried": result.retried,
        },
        updated_at=timezone.now(),
    )
    log.info(
        "extraction_succeeded",
        job_description_id=str(jd.pk),
        model=result.model,
        discarded=len(discarded),
        duration_ms=round((time.monotonic() - started) * 1000),
    )
    return ExtractionStatus.SUCCEEDED


def _document_text(version_id: str | None, *, scrub: bool) -> tuple[str | None, bool]:
    """Text of a submitted document, extracted on demand and never stored."""
    if not version_id:
        return None, False
    version = DocumentVersion.objects.filter(pk=version_id).first()
    if version is None:
        return None, False
    text = extract_text(get_storage().read(version.storage_key), version.mime_type)
    if not text:
        return None, False
    if scrub:
        text = scrub_contact_details(text)
    return truncate(text, settings.AI_MAX_CV_CHARS)


@shared_task(acks_late=True)
def generate_interview_prep(prep_id: str) -> str:
    with transaction.atomic():
        prep = (
            InterviewPreparation.objects.select_for_update(of=("self",))
            .select_related("application__company")
            .filter(pk=prep_id)
            .first()
        )
        if prep is None or prep.status not in ("queued", "processing"):
            return "skipped"
        prep.status = "processing"
        prep.save(update_fields=["status", "updated_at"])

    app = prep.application
    refs = prep.input_references
    provider = get_provider()
    started = time.monotonic()
    try:
        jd = JobDescription.objects.filter(pk=refs.get("job_description_id")).first()
        jd_text, jd_truncated = (
            truncate(jd.original_text, settings.AI_MAX_JD_CHARS) if jd else (None, False)
        )
        cv_text, cv_truncated = _document_text(refs.get("cv_version_id"), scrub=True)
        letter_text, _ = _document_text(refs.get("cover_letter_version_id"), scrub=True)
        missing = list(prep.missing_inputs)
        if refs.get("cv_version_id") and not cv_text and "submitted_cv" not in missing:
            missing.append("submitted_cv_text")
        system, user = prompts.prep_messages(
            job_title=app.job_title,
            company=app.company.name,
            job_description=jd_text,
            approved_requirements=jd.reviewed_data if jd and jd.reviewed_data else None,
            cv_text=cv_text,
            cover_letter_text=letter_text,
        )
        result = run_structured(provider, system, user, InterviewPrepOutput, task="interview_prep")
    except Exception as exc:
        code = _error_code(exc)
        InterviewPreparation.objects.filter(pk=prep.pk).update(
            status="failed", error=code, updated_at=timezone.now()
        )
        log.warning(
            "interview_prep_failed", prep_id=str(prep.pk), application_id=str(app.pk), error=code
        )
        if code == "unexpected_error":
            log.exception("interview_prep_unexpected_error", prep_id=str(prep.pk))
        return "failed"

    with transaction.atomic():
        InterviewPreparation.objects.filter(pk=prep.pk).update(
            status="succeeded",
            error="",
            content=result.data.model_dump(),
            missing_inputs=missing,
            model_name=result.model,
            prompt_version=prompts.PREP_PROMPT_VERSION,
            input_references={**refs, "jd_truncated": jd_truncated, "cv_truncated": cv_truncated},
            updated_at=timezone.now(),
        )
        record_activity(app, ActivityType.INTERVIEW_PREP, "Generated interview practice questions")
    log.info(
        "interview_prep_succeeded",
        prep_id=str(prep.pk),
        model=result.model,
        duration_ms=round((time.monotonic() - started) * 1000),
    )
    return "succeeded"
