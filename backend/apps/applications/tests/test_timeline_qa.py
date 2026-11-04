"""FR-08: timeline entries, notes and questions & answers."""

import pytest
from rest_framework.test import APIClient

from apps.applications.models import ApplicationActivity
from tests.factories import ApplicationFactory, QuestionFactory

pytestmark = pytest.mark.django_db


def test_record_manual_activity_and_list_newest_first(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    first = api.post(
        f"/api/v1/applications/{app.id}/activities",
        {"type": "call", "title": "Phone screen", "body": "Went well", "occurred_at": "2026-03-01T10:00:00Z"},
    )
    assert first.status_code == 201, first.json()
    api.post(f"/api/v1/applications/{app.id}/activities", {"type": "note", "title": "Prepared portfolio"})
    titles = [a["title"] for a in api.get(f"/api/v1/applications/{app.id}/activities").json()["results"]]
    assert titles[0] == "Prepared portfolio"
    assert "Phone screen" in titles


def test_cannot_create_system_activity_types(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(f"/api/v1/applications/{app.id}/activities", {"type": "submitted", "title": "Fake"})
    assert response.status_code == 400


def test_system_entries_are_immutable_but_manual_ones_editable(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    system = ApplicationActivity.objects.create(application=app, type="status_change", title="s", is_system_generated=True)
    manual = ApplicationActivity.objects.create(application=app, type="note", title="n")
    assert api.patch(f"/api/v1/applications/{app.id}/activities/{system.id}", {"title": "x"}).status_code == 409
    assert api.delete(f"/api/v1/applications/{app.id}/activities/{system.id}").status_code == 409
    assert api.patch(f"/api/v1/applications/{app.id}/activities/{manual.id}", {"body": "More"}).status_code == 200
    assert api.delete(f"/api/v1/applications/{app.id}/activities/{manual.id}").status_code == 204


def test_recorded_history_completes_the_record(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    detail = api.get(f"/api/v1/applications/{app.id}").json()
    assert [i["complete"] for i in detail["completeness"]["items"]] == [False, False, False]
    api.post(f"/api/v1/applications/{app.id}/activities", {"type": "email", "title": "Emailed recruiter"})
    detail = api.get(f"/api/v1/applications/{app.id}").json()
    assert detail["completeness"]["items"][2] == {"key": "history", "label": "Application history recorded", "complete": True}
    assert detail["completeness"]["percent"] == 33


def test_questions_and_answers(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    q1 = api.post(f"/api/v1/applications/{app.id}/questions", {"question": "Why us?", "answer": "Mission"}).json()
    q2 = api.post(f"/api/v1/applications/{app.id}/questions", {"question": "Salary expectations?"}).json()
    assert (q1["order"], q2["order"]) == (0, 1)
    api.patch(f"/api/v1/applications/{app.id}/questions/{q2['id']}", {"answer": "£60k", "order": 0})
    api.patch(f"/api/v1/applications/{app.id}/questions/{q1['id']}", {"order": 1})
    listed = api.get(f"/api/v1/applications/{app.id}/questions").json()
    assert [q["question"] for q in listed] == ["Salary expectations?", "Why us?"]
    assert listed[0]["answer"] == "£60k"
    assert api.delete(f"/api/v1/applications/{app.id}/questions/{q1['id']}").status_code == 204


def test_question_requires_text(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    QuestionFactory(application=app)
    assert api.post(f"/api/v1/applications/{app.id}/questions", {"question": ""}).status_code == 400
