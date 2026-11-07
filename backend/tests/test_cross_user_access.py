"""Shared authorization test: user B tries to read, change, delete and download
every kind of record user A owns. Every attempt must 404 (or 400 for related
IDs in a request body) and leave A's data unchanged.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.jobdescriptions import services as jd_services
from tests.factories import (
    ActivityFactory,
    ApplicationFactory,
    DocumentFactory,
    QuestionFactory,
    ReminderFactory,
    attach,
    make_version,
)
from tests.files import pdf_upload

pytestmark = pytest.mark.django_db


@dataclass
class Attempt:
    name: str
    method: str
    url: Callable[[dict[str, Any]], str]
    body: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    expected: int = 404


def owned_by_a(user_a: Any) -> dict[str, Any]:
    from apps.reminders.models import Notification

    app = ApplicationFactory(owner=user_a)
    document = DocumentFactory(owner=user_a)
    version = make_version(document)
    link = attach(app, version)
    jd_app = ApplicationFactory(owner=user_a)
    jd = jd_services.save_uploaded(
        jd_app, validate_file(text_pdf(["Spec"]), "jd.pdf", allow_images=False)
    )
    from apps.ai.models import InterviewPreparation

    prep = InterviewPreparation.objects.create(application=app, status="failed", user_notes="mine")
    from apps.exports.models import ExportJob

    export = ExportJob.objects.create(
        owner=user_a,
        status="succeeded",
        storage_key="u/a/export",
        expires_at="2099-01-01T00:00:00Z",
    )
    return {
        "export": export,
        "prep": prep,
        "document": document,
        "version": version,
        "link": link,
        "jd_app": jd_app,
        "jd": jd,
        "app": app,
        "company": app.company,
        "activity": ActivityFactory(application=app),
        "question": QuestionFactory(application=app),
        "reminder": ReminderFactory(application=app),
        "notification": Notification.objects.create(owner=user_a, kind="reminder", title="Mine"),
        "trashed": ApplicationFactory(owner=user_a, deleted_at="2026-01-01T00:00:00Z"),
    }


ATTEMPTS: list[Attempt] = [
    Attempt("read application", "get", lambda o: f"/api/v1/applications/{o['app'].id}"),
    Attempt(
        "update application",
        "patch",
        lambda o: f"/api/v1/applications/{o['app'].id}",
        lambda o: {"job_title": "x"},
    ),
    Attempt("delete application", "delete", lambda o: f"/api/v1/applications/{o['app'].id}"),
    Attempt(
        "change status",
        "post",
        lambda o: f"/api/v1/applications/{o['app'].id}/status",
        lambda o: {"status": "offer"},
    ),
    Attempt(
        "restore application", "post", lambda o: f"/api/v1/applications/{o['trashed'].id}/restore"
    ),
    Attempt("list activities", "get", lambda o: f"/api/v1/applications/{o['app'].id}/activities"),
    Attempt(
        "add activity",
        "post",
        lambda o: f"/api/v1/applications/{o['app'].id}/activities",
        lambda o: {"type": "note", "title": "x"},
    ),
    Attempt(
        "update activity",
        "patch",
        lambda o: f"/api/v1/applications/{o['app'].id}/activities/{o['activity'].id}",
        lambda o: {"title": "x"},
    ),
    Attempt(
        "delete activity",
        "delete",
        lambda o: f"/api/v1/applications/{o['app'].id}/activities/{o['activity'].id}",
    ),
    Attempt("list questions", "get", lambda o: f"/api/v1/applications/{o['app'].id}/questions"),
    Attempt(
        "update question",
        "patch",
        lambda o: f"/api/v1/applications/{o['app'].id}/questions/{o['question'].id}",
        lambda o: {"answer": "x"},
    ),
    Attempt(
        "delete question",
        "delete",
        lambda o: f"/api/v1/applications/{o['app'].id}/questions/{o['question'].id}",
    ),
    Attempt("read reminder", "get", lambda o: f"/api/v1/reminders/{o['reminder'].id}"),
    Attempt(
        "update reminder",
        "patch",
        lambda o: f"/api/v1/reminders/{o['reminder'].id}",
        lambda o: {"title": "x"},
    ),
    Attempt(
        "complete reminder", "post", lambda o: f"/api/v1/reminders/{o['reminder'].id}/complete"
    ),
    Attempt("cancel reminder", "post", lambda o: f"/api/v1/reminders/{o['reminder'].id}/cancel"),
    Attempt(
        "read notification", "post", lambda o: f"/api/v1/notifications/{o['notification'].id}/read"
    ),
    Attempt("read document", "get", lambda o: f"/api/v1/documents/{o['document'].id}"),
    Attempt(
        "rename document",
        "patch",
        lambda o: f"/api/v1/documents/{o['document'].id}",
        lambda o: {"title": "x"},
    ),
    Attempt("archive document", "delete", lambda o: f"/api/v1/documents/{o['document'].id}"),
    Attempt("list versions", "get", lambda o: f"/api/v1/documents/{o['document'].id}/versions"),
    Attempt(
        "upload version",
        "post",
        lambda o: f"/api/v1/documents/{o['document'].id}/versions",
        lambda o: {"file": pdf_upload()},
    ),
    Attempt(
        "download version",
        "get",
        lambda o: f"/api/v1/documents/versions/{o['version'].id}/download",
    ),
    Attempt("list attachments", "get", lambda o: f"/api/v1/applications/{o['app'].id}/documents"),
    Attempt(
        "change attachment",
        "patch",
        lambda o: f"/api/v1/applications/{o['app'].id}/documents/{o['link'].id}",
        lambda o: {"role": "other"},
    ),
    Attempt(
        "remove attachment",
        "delete",
        lambda o: f"/api/v1/applications/{o['app'].id}/documents/{o['link'].id}",
    ),
    Attempt(
        "upload attachment",
        "post",
        lambda o: f"/api/v1/applications/{o['app'].id}/documents/upload",
        lambda o: {"file": pdf_upload(), "role": "cv"},
    ),
    Attempt(
        "read job description",
        "get",
        lambda o: f"/api/v1/applications/{o['jd_app'].id}/job-description",
    ),
    Attempt(
        "download job description",
        "get",
        lambda o: f"/api/v1/applications/{o['jd_app'].id}/job-description/file",
    ),
    Attempt(
        "paste job description",
        "post",
        lambda o: f"/api/v1/applications/{o['app'].id}/job-description/paste",
        lambda o: {"text": "x" * 40},
    ),
    Attempt(
        "supplement job description",
        "post",
        lambda o: f"/api/v1/applications/{o['jd_app'].id}/job-description/text",
        lambda o: {"text": "x" * 40},
    ),
    Attempt(
        "run extraction",
        "post",
        lambda o: f"/api/v1/applications/{o['jd_app'].id}/job-description/extract",
    ),
    Attempt(
        "approve review",
        "put",
        lambda o: f"/api/v1/applications/{o['jd_app'].id}/job-description/review",
        lambda o: {"job_title": "x"},
    ),
    Attempt(
        "list interview prep", "get", lambda o: f"/api/v1/applications/{o['app'].id}/interview-prep"
    ),
    Attempt(
        "generate interview prep",
        "post",
        lambda o: f"/api/v1/applications/{o['app'].id}/interview-prep",
    ),
    Attempt("read interview prep", "get", lambda o: f"/api/v1/interview-preps/{o['prep'].id}"),
    Attempt(
        "edit prep notes",
        "patch",
        lambda o: f"/api/v1/interview-preps/{o['prep'].id}",
        lambda o: {"user_notes": "x"},
    ),
    Attempt(
        "retry interview prep", "post", lambda o: f"/api/v1/interview-preps/{o['prep'].id}/retry"
    ),
    Attempt("download export", "get", lambda o: f"/api/v1/exports/{o['export'].id}/download"),
    # Related IDs in request bodies are ownership-checked too.
    Attempt(
        "use company id",
        "post",
        lambda o: "/api/v1/applications",
        lambda o: {"company_id": str(o["company"].id), "job_title": "x"},
        400,
    ),
    Attempt(
        "use document version id",
        "post",
        lambda o: f"/api/v1/applications/{o['own_app'].id}/documents",
        lambda o: {"document_version_id": str(o["version"].id), "role": "cv"},
        400,
    ),
    Attempt(
        "use application id",
        "post",
        lambda o: "/api/v1/reminders",
        lambda o: {
            "application_id": str(o["app"].id),
            "type": "other",
            "title": "x",
            "remind_at": "2026-05-01T09:00:00Z",
            "channels": ["in_app"],
        },
        400,
    ),
]


@pytest.mark.parametrize("attempt", ATTEMPTS, ids=lambda a: a.name)
def test_other_users_records_are_invisible(
    attempt: Attempt, user, other_user, other_api: APIClient
) -> None:
    owned = owned_by_a(user)
    owned["own_app"] = ApplicationFactory(owner=other_user)
    body = attempt.body(owned) if attempt.body else None
    multipart = body is not None and any(hasattr(v, "read") for v in body.values())
    response = getattr(other_api, attempt.method)(
        attempt.url(owned), body, format="multipart" if multipart else "json"
    )
    assert response.status_code == attempt.expected, response.content
    owned["app"].refresh_from_db()
    assert owned["app"].deleted_at is None
    assert owned["app"].job_title != "x"
    assert owned["app"].status == "saved"
    owned["document"].refresh_from_db()
    assert owned["document"].archived_at is None
    assert owned["document"].title != "x"
    assert owned["document"].versions.count() == 1
    owned["prep"].refresh_from_db()
    assert owned["prep"].user_notes == "mine"
    assert owned["jd"].__class__.objects.get(pk=owned["jd"].pk).reviewed_data is None
    owned["link"].refresh_from_db()
    assert owned["link"].role == "cv"


def test_lists_never_include_other_users_records(user, other_api: APIClient) -> None:
    owned_by_a(user)
    for url in [
        "/api/v1/applications",
        "/api/v1/applications?trash=1",
        "/api/v1/reminders",
        "/api/v1/notifications",
        "/api/v1/documents",
        "/api/v1/documents?archived=1&include_non_master=1",
    ]:
        assert other_api.get(url).json()["count"] == 0, url
    assert other_api.get("/api/v1/exports").json() == []
    summary = other_api.get("/api/v1/dashboard/summary").json()
    assert summary["counts"]["total"] == 0
    assert other_api.get("/api/v1/analytics").json()["completeness"]["total"] == 0
    assert other_api.get("/api/v1/notifications/unread-count").json() == {"count": 0}
