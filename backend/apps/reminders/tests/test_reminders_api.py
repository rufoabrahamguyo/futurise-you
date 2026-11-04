"""FR-09: reminder CRUD, scopes, completion and notifications API."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.applications.models import ApplicationActivity
from apps.reminders.models import Notification, Reminder
from tests.factories import ApplicationFactory, ReminderFactory

pytestmark = pytest.mark.django_db


def test_create_reminder_stores_utc(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(
        "/api/v1/reminders",
        {
            "application_id": str(app.id),
            "type": "follow_up",
            "title": "Chase recruiter",
            "remind_at": "2026-07-15T09:00:00+01:00",
            "channels": ["email", "in_app", "email"],
        },
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["remind_at"] == "2026-07-15T08:00:00Z"
    assert body["channels"] == ["email", "in_app"]
    assert body["status"] == "pending"
    assert body["application"]["company_name"] == app.company.name


def test_create_rejects_other_users_application(api: APIClient, other_user) -> None:
    foreign = ApplicationFactory(owner=other_user)
    response = api.post(
        "/api/v1/reminders",
        {
            "application_id": str(foreign.id),
            "type": "other",
            "title": "x",
            "remind_at": timezone.now().isoformat(),
            "channels": ["in_app"],
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["application_id"] == ["Application not found."]


def test_requires_at_least_one_channel(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(
        "/api/v1/reminders",
        {
            "application_id": str(app.id),
            "type": "other",
            "title": "x",
            "remind_at": timezone.now().isoformat(),
            "channels": [],
        },
    )
    assert response.status_code == 400


def test_scopes(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    now = timezone.now()
    upcoming = ReminderFactory(application=app, remind_at=now + timedelta(days=1))
    overdue = ReminderFactory(application=app, remind_at=now - timedelta(days=1), status="sent")
    done = ReminderFactory(application=app, status="completed", completed_at=now)
    ReminderFactory(application=ApplicationFactory(owner=user, deleted_at=now))

    def ids(scope: str) -> set[str]:
        return {r["id"] for r in api.get(f"/api/v1/reminders?scope={scope}").json()["results"]}

    assert ids("upcoming") == {str(upcoming.id)}
    assert ids("overdue") == {str(overdue.id)}
    assert ids("completed") == {str(done.id)}
    assert ids("open") == {str(upcoming.id), str(overdue.id)}
    assert api.get("/api/v1/reminders").json()["count"] == 3


def test_complete_and_cancel(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    interview = ReminderFactory(application=app, type="interview")
    follow_up = ReminderFactory(application=app, type="follow_up")
    other = ReminderFactory(application=app)

    assert api.post(f"/api/v1/reminders/{interview.id}/complete").json()["status"] == "completed"
    assert ApplicationActivity.objects.filter(application=app, type="reminder").count() == 1
    # Follow-ups don't log an entry themselves; the UI asks the user to record what happened.
    api.post(f"/api/v1/reminders/{follow_up.id}/complete")
    assert ApplicationActivity.objects.filter(application=app, type="reminder").count() == 1
    assert api.post(f"/api/v1/reminders/{other.id}/cancel").json()["status"] == "cancelled"
    edit = api.patch(f"/api/v1/reminders/{other.id}", {"title": "New"})
    assert edit.status_code == 409


def test_rescheduling_a_sent_reminder_makes_it_pending_again(api: APIClient, user) -> None:
    reminder = ReminderFactory(
        application=ApplicationFactory(owner=user), status="sent", sent_at=timezone.now()
    )
    Notification.objects.create(owner=user, reminder=reminder, kind="reminder", title="t")
    later = (timezone.now() + timedelta(days=2)).isoformat()
    body = api.patch(f"/api/v1/reminders/{reminder.id}", {"remind_at": later}).json()
    assert body["status"] == "pending"
    assert not Notification.objects.filter(reminder=reminder).exists()
    assert Reminder.objects.get(pk=reminder.pk).sent_at is None


def test_notifications(api: APIClient, user, other_user) -> None:
    Notification.objects.create(owner=user, kind="reminder", title="A")
    n2 = Notification.objects.create(owner=user, kind="reminder", title="B")
    Notification.objects.create(owner=other_user, kind="reminder", title="Not mine")
    assert api.get("/api/v1/notifications/unread-count").json() == {"count": 2}
    assert api.post(f"/api/v1/notifications/{n2.id}/read").json()["read_at"] is not None
    assert api.get("/api/v1/notifications/unread-count").json() == {"count": 1}
    assert api.post("/api/v1/notifications/read-all").status_code == 204
    assert api.get("/api/v1/notifications/unread-count").json() == {"count": 0}
    assert len(api.get("/api/v1/notifications").json()["results"]) == 2
