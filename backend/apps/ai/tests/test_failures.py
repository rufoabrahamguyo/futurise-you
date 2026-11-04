"""An AI failure must never lose data or block manual entry."""

import pytest
from rest_framework.test import APIClient

from apps.ai.fake import extract
from apps.ai.providers import ProviderError
from apps.applications.models import Application
from apps.jobdescriptions.models import JobDescription
from tests.factories import ApplicationFactory, JobDescriptionFactory

pytestmark = pytest.mark.django_db

JD = "Data Engineer\nHarbor & Co\nLocation: Bristol, UK\n\nRequirements\n- 3+ years of experience with Python"


def _setup(user):
    app = ApplicationFactory(owner=user, job_title="Data Engineer", location="Bristol")
    jd = JobDescriptionFactory(
        application=app,
        original_text=JD,
        reviewed_data={"job_title": "Data Engineer", "required_skills": ["Python"]},
    )
    return app, jd


def test_provider_failure_keeps_every_byte_of_user_data(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    app, jd = _setup(acknowledged)
    before = Application.objects.filter(pk=app.pk).values().get()
    use_provider([ProviderError("ConnectTimeout")])
    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(f"/api/v1/applications/{app.id}/job-description/extract").status_code == 202
    after_jd = JobDescription.objects.get(pk=jd.pk)
    assert after_jd.extraction_status == "failed"
    assert after_jd.extraction_error == "provider_unavailable"
    assert after_jd.original_text == JD
    assert after_jd.reviewed_data == {"job_title": "Data Engineer", "required_skills": ["Python"]}
    after = Application.objects.filter(pk=app.pk).values().get()
    assert {k: v for k, v in after.items() if k != "updated_at"} == {
        k: v for k, v in before.items() if k != "updated_at"
    }
    # Manual entry still works while extraction has failed.
    assert api.patch(f"/api/v1/applications/{app.id}", {"location": "Remote"}).status_code == 200


def test_invalid_output_is_retried_once_then_fails_cleanly(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    app, jd = _setup(acknowledged)
    provider = use_provider(
        ["Sure! Here is the JSON you asked for:", {"job_title": "not a quoted object"}]
    )
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    jd.refresh_from_db()
    assert jd.extraction_status == "failed"
    assert jd.extraction_error == "invalid_output"
    assert len(provider.prompts) == 2
    assert "previous reply was not valid" in provider.prompts[1][1]


def test_retry_after_invalid_output_succeeds(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    app, jd = _setup(acknowledged)
    use_provider(["not json", extract(JD)])
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    jd.refresh_from_db()
    assert jd.extraction_status == "succeeded"
    assert jd.raw_ai_output["retried"] is True


def test_retry_button_requeues_a_failed_extraction(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks
) -> None:
    app, jd = _setup(acknowledged)
    use_provider([ProviderError("HTTPStatusError"), extract(JD)])
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    assert JobDescription.objects.get(pk=jd.pk).extraction_status == "failed"
    with django_capture_on_commit_callbacks(execute=True):
        assert api.post(f"/api/v1/applications/{app.id}/job-description/extract").status_code == 202
    jd.refresh_from_db()
    assert jd.extraction_status == "succeeded"
    assert jd.extraction_error == ""


def test_logs_never_contain_document_text(
    api: APIClient, acknowledged, use_provider, django_capture_on_commit_callbacks, caplog
) -> None:
    app, _ = _setup(acknowledged)
    use_provider([ProviderError("ConnectTimeout")])
    with caplog.at_level("DEBUG"), django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/applications/{app.id}/job-description/extract")
    joined = "\n".join(str(r.msg) + str(r.args) for r in caplog.records)
    assert "Harbor & Co" not in joined
    assert "3+ years of experience" not in joined
