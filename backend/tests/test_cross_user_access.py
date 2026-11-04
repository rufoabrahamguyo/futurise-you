"""Shared authorization test: user B tries to read, change, delete and download
every kind of record user A owns. Every attempt must 404 (or 400 for related
IDs in a request body) and leave A's data unchanged.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest
from rest_framework.test import APIClient

from tests.factories import (
    ActivityFactory,
    ApplicationFactory,
    QuestionFactory,
    ReminderFactory,
)

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
    return {
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
    Attempt("update application", "patch", lambda o: f"/api/v1/applications/{o['app'].id}", lambda o: {"job_title": "x"}),
    Attempt("delete application", "delete", lambda o: f"/api/v1/applications/{o['app'].id}"),
    Attempt("change status", "post", lambda o: f"/api/v1/applications/{o['app'].id}/status", lambda o: {"status": "offer"}),
    Attempt("restore application", "post", lambda o: f"/api/v1/applications/{o['trashed'].id}/restore"),
    Attempt("list activities", "get", lambda o: f"/api/v1/applications/{o['app'].id}/activities"),
    Attempt("add activity", "post", lambda o: f"/api/v1/applications/{o['app'].id}/activities", lambda o: {"type": "note", "title": "x"}),
    Attempt("update activity", "patch", lambda o: f"/api/v1/applications/{o['app'].id}/activities/{o['activity'].id}", lambda o: {"title": "x"}),
    Attempt("delete activity", "delete", lambda o: f"/api/v1/applications/{o['app'].id}/activities/{o['activity'].id}"),
    Attempt("list questions", "get", lambda o: f"/api/v1/applications/{o['app'].id}/questions"),
    Attempt("update question", "patch", lambda o: f"/api/v1/applications/{o['app'].id}/questions/{o['question'].id}", lambda o: {"answer": "x"}),
    Attempt("delete question", "delete", lambda o: f"/api/v1/applications/{o['app'].id}/questions/{o['question'].id}"),
    Attempt("read reminder", "get", lambda o: f"/api/v1/reminders/{o['reminder'].id}"),
    Attempt("update reminder", "patch", lambda o: f"/api/v1/reminders/{o['reminder'].id}", lambda o: {"title": "x"}),
    Attempt("complete reminder", "post", lambda o: f"/api/v1/reminders/{o['reminder'].id}/complete"),
    Attempt("cancel reminder", "post", lambda o: f"/api/v1/reminders/{o['reminder'].id}/cancel"),
    Attempt("read notification", "post", lambda o: f"/api/v1/notifications/{o['notification'].id}/read"),
    # Related IDs in request bodies are ownership-checked too.
    Attempt("use company id", "post", lambda o: "/api/v1/applications", lambda o: {"company_id": str(o["company"].id), "job_title": "x"}, 400),
    Attempt(
        "use application id",
        "post",
        lambda o: "/api/v1/reminders",
        lambda o: {"application_id": str(o["app"].id), "type": "other", "title": "x", "remind_at": "2026-05-01T09:00:00Z", "channels": ["in_app"]},
        400,
    ),
]


@pytest.mark.parametrize("attempt", ATTEMPTS, ids=lambda a: a.name)
def test_other_users_records_are_invisible(attempt: Attempt, user, other_api: APIClient) -> None:
    owned = owned_by_a(user)
    body = attempt.body(owned) if attempt.body else None
    response = getattr(other_api, attempt.method)(attempt.url(owned), body, format="json")
    assert response.status_code == attempt.expected, response.content
    owned["app"].refresh_from_db()
    assert owned["app"].deleted_at is None
    assert owned["app"].job_title != "x"
    assert owned["app"].status == "saved"


def test_lists_never_include_other_users_records(user, other_api: APIClient) -> None:
    owned_by_a(user)
    for url in ["/api/v1/applications", "/api/v1/applications?trash=1", "/api/v1/reminders", "/api/v1/notifications"]:
        assert other_api.get(url).json()["count"] == 0, url
    summary = other_api.get("/api/v1/dashboard/summary").json()
    assert summary["counts"]["total"] == 0
