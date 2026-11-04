"""FR-05: extraction runs in the background, quotes are enforced, and the user
reviews the result before any application field changes."""

import pytest
from rest_framework.test import APIClient

from apps.ai.fake import extract
from apps.applications.models import ApplicationActivity
from apps.jobdescriptions.models import JobDescription
from tests.factories import ApplicationFactory, JobDescriptionFactory

pytestmark = pytest.mark.django_db

JD = """Data Engineer
Harbor & Co
Location: Bristol, UK
Employment type: Full-time

Responsibilities
- Build reliable data pipelines in Python and SQL

Requirements
- 3+ years of experience with Python

How to apply
Send your CV and a cover letter.
Applications close on 30 June 2026.
"""


def _extract(api: APIClient, app_id, capture) -> dict:
    """Queues extraction, runs the task on commit, then returns the updated record."""
    with capture(execute=True):
        response = api.post(f"/api/v1/applications/{app_id}/job-description/extract")
    assert response.status_code == 202, response.json()
    return api.get(f"/api/v1/applications/{app_id}/job-description").json()


def test_fake_provider_quotes_the_source() -> None:
    result = extract(JD)
    assert result["job_title"] == {"value": "Data Engineer", "quote": "Data Engineer"}
    assert result["location"]["value"] == "Bristol, UK"
    assert result["deadline"]["value"] == "30 June 2026"
    assert {s["value"] for s in result["required_skills"]} >= {"Python", "SQL"}
    assert result["compensation"] is None


def test_extraction_succeeds_with_quotes_and_unsupported_values_not_specified(
    api: APIClient, acknowledged, django_capture_on_commit_callbacks
) -> None:
    app = ApplicationFactory(owner=acknowledged)
    JobDescriptionFactory(application=app, original_text=JD)
    jd = _extract(api, app.id, django_capture_on_commit_callbacks)
    assert jd["extraction_status"] == "succeeded"
    output = jd["raw_ai_output"]["output"]
    assert output["company"]["value"] == "Harbor & Co"
    assert output["deadline"] == {
        "value": "30 June 2026",
        "quote": "Applications close on 30 June 2026.",
        "parsed_date": "2026-06-30",
    }
    # Not in the job description → null, which the UI shows as "Not specified".
    assert output["compensation"] is None
    assert output["benefits"] == []
    assert jd["raw_ai_output"]["prompt_version"] == "extract-v1"
    # Nothing is applied to the application until the user approves.
    app.refresh_from_db()
    assert app.location == "London"
    assert jd["reviewed_data"] is None


def test_hallucinated_values_are_discarded(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    app = ApplicationFactory(owner=acknowledged)
    JobDescriptionFactory(application=app, original_text=JD)
    fabricated = extract(JD)
    fabricated["compensation"] = {"value": "£90,000", "quote": "Salary: £90,000"}
    fabricated["deadline"] = {"value": "1 July 2026", "quote": "Apply by 1 July 2026"}
    use_provider([fabricated])
    jd = _extract(api, app.id, django_capture_on_commit_callbacks)
    output = jd["raw_ai_output"]["output"]
    assert output["compensation"] is None
    assert output["deadline"] is None
    assert {d["field"] for d in jd["raw_ai_output"]["discarded"]} == {"compensation", "deadline"}


def test_requires_ai_notice_acknowledgement(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    JobDescriptionFactory(application=app, original_text=JD)
    response = api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ai_notice_required"
    assert JobDescription.objects.get(application=app).extraction_status == "not_started"


def test_daily_limit_is_friendly(
    api: APIClient, acknowledged, settings, django_capture_on_commit_callbacks
) -> None:
    settings.AI_DAILY_LIMIT = 1
    first = ApplicationFactory(owner=acknowledged)
    second = ApplicationFactory(owner=acknowledged)
    JobDescriptionFactory(application=first, original_text=JD)
    JobDescriptionFactory(application=second, original_text=JD)
    with django_capture_on_commit_callbacks(execute=True):
        assert (
            api.post(f"/api/v1/applications/{first.id}/job-description/extract").status_code == 202
        )
    response = api.post(f"/api/v1/applications/{second.id}/job-description/extract")
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "ai_daily_limit"
    assert "enter everything manually" in response.json()["error"]["message"]
    assert api.get("/api/v1/ai/usage").json() == {"used_today": 1, "daily_limit": 1}


def test_no_text_cannot_be_extracted(api: APIClient, acknowledged) -> None:
    app = ApplicationFactory(owner=acknowledged)
    JobDescriptionFactory(application=app, original_text="", source_type="upload", text_source="")
    response = api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    assert response.status_code == 400
    assert response.json()["error"]["details"]["text"]


def test_approving_the_review_updates_the_application(
    api: APIClient, acknowledged, django_capture_on_commit_callbacks
) -> None:
    app = ApplicationFactory(owner=acknowledged, job_title="Untitled", location="")
    JobDescriptionFactory(application=app, original_text=JD)
    _extract(api, app.id, django_capture_on_commit_callbacks)
    response = api.put(
        f"/api/v1/applications/{app.id}/job-description/review",
        {
            "job_title": "Data Engineer",
            "company": "Harbor & Co",
            "location": "Bristol, UK",
            "employment_type": "full_time",
            "work_arrangement": "",
            "compensation": None,
            "deadline_text": "30 June 2026",
            "deadline": "2026-06-30",
            "required_skills": ["Python", "SQL"],
            "mandatory_requirements": ["3+ years of experience with Python"],
        },
    )
    assert response.status_code == 200, response.json()
    jd = response.json()
    assert jd["reviewed_data"]["work_arrangement"] is None
    assert jd["reviewed_data"]["deadline"] == "2026-06-30"
    assert jd["reviewed_at"] is not None
    # The AI suggestion is kept separately and unchanged.
    assert jd["raw_ai_output"]["output"]["job_title"]["value"] == "Data Engineer"

    app.refresh_from_db()
    assert (app.job_title, app.company.name, app.location, app.employment_type) == (
        "Data Engineer",
        "Harbor & Co",
        "Bristol, UK",
        "full_time",
    )
    assert str(app.deadline) == "2026-06-30"
    activity = ApplicationActivity.objects.get(application=app, type="extraction_reviewed")
    assert "company" in activity.metadata["updated_fields"]


def test_review_validates_choices(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    JobDescriptionFactory(application=app)
    response = api.put(
        f"/api/v1/applications/{app.id}/job-description/review", {"employment_type": "gig"}
    )
    assert response.status_code == 400
