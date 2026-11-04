"""FR-10: interview preparation from the saved record."""

import pytest
from rest_framework.test import APIClient

from apps.ai.providers import ProviderError
from apps.applications.models import ApplicationActivity
from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.documents import services as documents
from tests.factories import ApplicationFactory, JobDescriptionFactory

pytestmark = pytest.mark.django_db

JD = """Platform Engineer
Quartz Systems

Responsibilities
- Build and run our Kubernetes platform

Requirements
- 4+ years of experience with Python or Go
"""


def _submitted_app(user, *, cv: bool = True, letter: bool = False, status: str = "interview"):
    app = ApplicationFactory(owner=user, status="preparing", job_title="Platform Engineer")
    JobDescriptionFactory(application=app, original_text=JD)
    if cv:
        file = validate_file(
            text_pdf(
                [
                    "Riley Tester",
                    "riley@example.com  +44 7700 900123",
                    "Led Kubernetes migration at Acme in 2024.",
                ]
            ),
            "cv.pdf",
            allow_images=False,
        )
        documents.attach_version(
            app, documents.create_document(user, title="CV", type="cv", file=file), "cv"
        )
    if letter:
        file = validate_file(
            text_pdf(["Dear team, I love platforms."]), "letter.pdf", allow_images=False
        )
        documents.attach_version(
            app,
            documents.create_document(user, title="Letter", type="cover_letter", file=file),
            "cover_letter",
        )
    from apps.applications.services import change_status

    change_status(app, "applied", user=user)
    change_status(app, status, user=user)
    app.refresh_from_db()
    return app


def test_only_available_from_interview_onwards(api: APIClient, acknowledged) -> None:
    app = _submitted_app(acknowledged, status="assessment")
    response = api.post(f"/api/v1/applications/{app.id}/interview-prep")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "prep_not_available"
    later = _submitted_app(acknowledged, status="offer")
    assert api.post(f"/api/v1/applications/{later.id}/interview-prep").status_code == 202


def test_generates_from_saved_record_and_reports_missing_inputs(
    api: APIClient, acknowledged, django_capture_on_commit_callbacks
) -> None:
    app = _submitted_app(acknowledged)
    with django_capture_on_commit_callbacks(execute=True):
        queued = api.post(f"/api/v1/applications/{app.id}/interview-prep").json()
    assert queued["status"] == "queued"
    prep = api.get(f"/api/v1/applications/{app.id}/interview-prep").json()[0]
    assert prep["status"] == "succeeded"
    content = prep["content"]
    assert content["technical_questions"] and content["behavioral_questions"]
    assert content["role_questions"] and content["preparation_topics"]
    assert any("Kubernetes" in q["question"] for q in content["technical_questions"])
    assert any("Kubernetes" in q["cv_evidence"] for q in content["cv_questions"])
    assert set(prep["missing_inputs"]) == {"approved_requirements", "submitted_cover_letter"}
    assert prep["input_references"]["cv_version_id"]
    assert ApplicationActivity.objects.filter(application=app, type="interview_prep").exists()


def test_cv_contact_details_are_removed_before_sending(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    from apps.ai.fake import interview_prep

    app = _submitted_app(acknowledged, letter=True)
    captured: dict[str, str] = {}

    def respond(system: str, user: str) -> str:
        captured["user"] = user
        import json

        return json.dumps(interview_prep(user))

    provider = use_provider(["placeholder"])
    provider.complete = lambda system, user, *, task: type(
        "C", (), {"text": respond(system, user), "model": "spy"}
    )()  # type: ignore[method-assign]
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/interview-prep")
    assert "Led Kubernetes migration" in captured["user"]
    assert "riley@example.com" not in captured["user"]
    assert "900123" not in captured["user"]
    assert "<<<SUBMITTED_COVER_LETTER_START>>>" in captured["user"]


def test_without_submitted_cv_generates_and_says_so(
    api: APIClient, acknowledged, django_capture_on_commit_callbacks
) -> None:
    app = _submitted_app(acknowledged, cv=False)
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/interview-prep")
    prep = api.get(f"/api/v1/applications/{app.id}/interview-prep").json()[0]
    assert prep["status"] == "succeeded"
    assert "submitted_cv" in prep["missing_inputs"]
    assert prep["content"]["cv_questions"] == []


def test_failure_then_retry_and_notes(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    from apps.ai.fake import interview_prep

    app = _submitted_app(acknowledged)
    use_provider([ProviderError("ReadTimeout")])
    with django_capture_on_commit_callbacks(execute=True):
        prep_id = api.post(f"/api/v1/applications/{app.id}/interview-prep").json()["id"]
    assert api.get(f"/api/v1/interview-preps/{prep_id}").json()["status"] == "failed"

    import json

    from apps.ai.prompts import prep_messages

    _, user_prompt = prep_messages(
        job_title="Platform Engineer",
        company="x",
        job_description=JD,
        approved_requirements=None,
        cv_text=None,
        cover_letter_text=None,
    )
    use_provider([json.dumps(interview_prep(user_prompt))])
    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(f"/api/v1/interview-preps/{prep_id}/retry").status_code == 202
    assert api.get(f"/api/v1/interview-preps/{prep_id}").json()["status"] == "succeeded"

    saved = api.patch(
        f"/api/v1/interview-preps/{prep_id}",
        {"user_notes": "Practise the Kubernetes story.", "status": "failed"},
    ).json()
    assert saved["user_notes"] == "Practise the Kubernetes story."
    assert saved["status"] == "succeeded"


def test_each_generation_is_kept(
    api: APIClient, acknowledged, django_capture_on_commit_callbacks
) -> None:
    app = _submitted_app(acknowledged)
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/interview-prep")
        api.post(f"/api/v1/applications/{app.id}/interview-prep")
    assert len(api.get(f"/api/v1/applications/{app.id}/interview-prep").json()) == 2
