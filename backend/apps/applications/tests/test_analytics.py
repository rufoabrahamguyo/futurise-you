"""Basic analytics: counts by status, submissions over time, completeness."""

from datetime import date

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.documents.models import ApplicationDocument
from tests.factories import (
    ActivityFactory,
    ApplicationFactory,
    DocumentFactory,
    JobDescriptionFactory,
    attach,
    make_version,
)

pytestmark = pytest.mark.django_db


@freeze_time("2026-06-17 12:00:00")  # a Wednesday
def test_analytics(api: APIClient, user, other_user) -> None:
    complete = ApplicationFactory(owner=user, status="interview", date_applied=date(2026, 6, 15))
    JobDescriptionFactory(application=complete)
    link = attach(complete, make_version(DocumentFactory(owner=user)))
    ApplicationDocument.objects.filter(pk=link.pk).update(is_frozen=True)
    ActivityFactory(application=complete, type="call")
    ApplicationFactory(owner=user, status="applied", date_applied=date(2026, 6, 8))
    ApplicationFactory(
        owner=user, status="applied", date_applied=date(2025, 1, 1)
    )  # outside the window
    ApplicationFactory(owner=user, status="saved")
    ApplicationFactory(owner=other_user, status="applied", date_applied=date(2026, 6, 15))

    data = api.get("/api/v1/analytics").json()
    counts = {row["status"]: row["count"] for row in data["by_status"]}
    assert counts == {
        "saved": 1,
        "preparing": 0,
        "applied": 2,
        "assessment": 0,
        "interview": 1,
        "offer": 0,
        "rejected": 0,
        "withdrawn": 0,
    }
    weeks = data["submitted_per_week"]
    assert len(weeks) == 12
    assert weeks[-1] == {"week_start": "2026-06-15", "count": 1}
    assert weeks[-2] == {"week_start": "2026-06-08", "count": 1}
    assert data["completeness"] == {
        "percent": 25,  # 3 of 12 core items preserved across 4 applications
        "complete_records": 1,
        "total": 4,
        "items": {"job_description": 1, "submitted_documents": 1, "history": 1},
    }


def test_empty_analytics(api: APIClient) -> None:
    data = api.get("/api/v1/analytics").json()
    assert data["completeness"]["percent"] == 0
    assert sum(row["count"] for row in data["by_status"]) == 0
