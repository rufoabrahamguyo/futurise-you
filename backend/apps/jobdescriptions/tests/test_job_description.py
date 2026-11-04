"""FR-04: the job description record is preserved unchanged."""

import pytest
from rest_framework.test import APIClient

from apps.common.exceptions import ImmutableRecordError
from apps.jobdescriptions.models import JobDescription
from tests.factories import ApplicationFactory, JobDescriptionFactory
from tests.files import LEGACY_DOC_BYTES, blank_pdf_upload, docx_upload, pdf_upload, upload

pytestmark = pytest.mark.django_db

TEXT = (
    "Senior Engineer\nLocation: London\nWe are hiring a senior engineer to lead our platform team."
)


def test_paste_saves_original_text_exactly(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    raw = "  " + TEXT + "\n\n  "
    response = api.post(f"/api/v1/applications/{app.id}/job-description/paste", {"text": raw})
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["original_text"] == raw
    assert body["source_type"] == "paste"
    assert body["extraction_status"] == "not_started"
    assert (
        api.get(f"/api/v1/applications/{app.id}").json()["completeness"]["items"][0]["complete"]
        is True
    )


def test_upload_pdf_extracts_text_and_keeps_file(api: APIClient, user, storage) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(
        f"/api/v1/applications/{app.id}/job-description/upload",
        {"file": pdf_upload("Job Spec.pdf", "Data Engineer", "Requirements: Python and SQL")},
        format="multipart",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert "Requirements: Python and SQL" in body["original_text"]
    assert body["text_source"] == "file"
    assert body["original_filename"] == "Job Spec.pdf"
    assert "original_file_key" not in body
    jd = JobDescription.objects.get(application=app)
    assert storage.exists(jd.original_file_key)
    link = api.get(f"/api/v1/applications/{app.id}/job-description/file?inline=1").json()
    assert link["filename"] == "Job Spec.pdf"


def test_upload_docx(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    body = api.post(
        f"/api/v1/applications/{app.id}/job-description/upload",
        {"file": docx_upload("spec.docx", "Product Manager", "Own the roadmap")},
        format="multipart",
    ).json()
    assert "Own the roadmap" in body["original_text"]


def test_scanned_pdf_asks_for_pasted_text_once(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    body = api.post(
        f"/api/v1/applications/{app.id}/job-description/upload",
        {"file": blank_pdf_upload()},
        format="multipart",
    ).json()
    assert body["has_text"] is False
    assert body["has_file"] is True
    supplemented = api.post(
        f"/api/v1/applications/{app.id}/job-description/text", {"text": TEXT}
    ).json()
    assert supplemented["original_text"] == TEXT
    assert supplemented["text_source"] == "paste_supplement"
    again = api.post(
        f"/api/v1/applications/{app.id}/job-description/text", {"text": TEXT + " edited"}
    )
    assert again.status_code == 409


def test_cannot_replace_job_description(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    api.post(f"/api/v1/applications/{app.id}/job-description/paste", {"text": TEXT})
    second = api.post(
        f"/api/v1/applications/{app.id}/job-description/paste", {"text": TEXT + " v2"}
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "job_description_exists"
    upload_again = api.post(
        f"/api/v1/applications/{app.id}/job-description/upload",
        {"file": pdf_upload()},
        format="multipart",
    )
    assert upload_again.status_code == 409
    assert JobDescription.objects.get(application=app).original_text == TEXT


def test_original_is_immutable_at_model_layer() -> None:
    jd = JobDescriptionFactory(original_text=TEXT)
    jd.original_text = "tampered"
    with pytest.raises(ImmutableRecordError):
        jd.save()
    jd.refresh_from_db()
    jd.original_filename = "other.pdf"
    with pytest.raises(ImmutableRecordError):
        jd.save()


def test_rejects_short_text_bad_files_and_missing(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    assert api.get(f"/api/v1/applications/{app.id}/job-description").status_code == 404
    assert (
        api.post(
            f"/api/v1/applications/{app.id}/job-description/paste", {"text": "too short"}
        ).status_code
        == 400
    )
    legacy = api.post(
        f"/api/v1/applications/{app.id}/job-description/upload",
        {"file": upload("jd.doc", LEGACY_DOC_BYTES)},
        format="multipart",
    )
    assert legacy.status_code == 400
    assert not JobDescription.objects.filter(application=app).exists()
