"""Query helpers shared by list, detail, dashboard and analytics."""

from django.db.models import Case, Exists, IntegerField, OuterRef, Q, QuerySet, Value, When

from apps.documents.models import ApplicationDocument
from apps.jobdescriptions.models import JobDescription

from .models import ActivityType, Application, ApplicationActivity
from .statuses import STATUS_ORDER

COMPLETENESS_ITEMS = (
    ("has_job_description", "job_description", "Job description saved"),
    ("has_submitted_documents", "submitted_documents", "Submitted documents preserved"),
    ("has_history", "history", "Application history recorded"),
)


def with_record_flags(qs: QuerySet[Application]) -> QuerySet[Application]:
    """Annotates the three items that make an application record complete."""
    return qs.annotate(
        has_job_description=Exists(
            JobDescription.objects.filter(application=OuterRef("pk")).filter(
                Q(original_text__gt="") | Q(original_file_key__gt="")
            )
        ),
        has_submitted_documents=Exists(
            ApplicationDocument.objects.filter(application=OuterRef("pk"), is_frozen=True)
        ),
        has_history=Exists(
            ApplicationActivity.objects.filter(application=OuterRef("pk")).exclude(
                type=ActivityType.CREATED
            )
        ),
    )


def completeness(application: Application) -> dict[str, object]:
    items = [
        {"key": key, "label": label, "complete": bool(getattr(application, attr, False))}
        for attr, key, label in COMPLETENESS_ITEMS
    ]
    done = sum(1 for item in items if item["complete"])
    return {"percent": round(done * 100 / len(items)), "items": items}


def status_rank() -> Case:
    return Case(
        *[When(status=value, then=Value(index)) for index, value in enumerate(STATUS_ORDER)],
        output_field=IntegerField(),
    )
