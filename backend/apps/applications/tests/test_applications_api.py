"""FR-02 / FR-03: application CRUD, search, filters, soft delete and dashboard."""

from datetime import date, timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.applications.models import Application
from apps.companies.models import Company
from tests.factories import ActivityFactory, ApplicationFactory, CompanyFactory, ReminderFactory

pytestmark = pytest.mark.django_db


def test_create_with_company_name_reuses_company_case_insensitively(api: APIClient, user) -> None:
    first = api.post("/api/v1/applications", {"company_name": "Acme Ltd", "job_title": "Engineer"})
    assert first.status_code == 201, first.json()
    second = api.post(
        "/api/v1/applications", {"company_name": "  acme   ltd ", "job_title": "Designer"}
    )
    assert second.status_code == 201
    assert first.json()["company"]["id"] == second.json()["company"]["id"]
    assert Company.objects.filter(owner=user).count() == 1
    body = first.json()
    assert body["status"] == "saved"
    assert body["completeness"]["percent"] == 0


def test_create_records_a_timeline_entry(api: APIClient) -> None:
    app_id = api.post(
        "/api/v1/applications", {"company_name": "Acme", "job_title": "Engineer"}
    ).json()["id"]
    timeline = api.get(f"/api/v1/applications/{app_id}/activities").json()["results"]
    assert [a["type"] for a in timeline] == ["created"]
    assert timeline[0]["is_system_generated"] is True


def test_create_requires_title_and_company(api: APIClient) -> None:
    response = api.post("/api/v1/applications", {"job_title": ""})
    assert response.status_code == 400
    details = response.json()["error"]["details"]
    assert "job_title" in details


def test_create_rejects_another_users_company_id(api: APIClient, other_user) -> None:
    foreign = CompanyFactory(owner=other_user)
    response = api.post(
        "/api/v1/applications", {"company_id": str(foreign.id), "job_title": "Engineer"}
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["company_id"] == ["Company not found."]


def test_update_fields_but_not_status(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.patch(
        f"/api/v1/applications/{app.id}",
        {
            "location": "Remote",
            "work_arrangement": "remote",
            "status": "offer",
            "job_url": "https://jobs.example.com/1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["location"] == "Remote"
    assert body["status"] == "saved"
    assert body["job_url"] == "https://jobs.example.com/1"


def test_rejects_invalid_choice(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.patch(f"/api/v1/applications/{app.id}", {"work_arrangement": "moon"})
    assert response.status_code == 400


def test_list_search_filter_and_order(api: APIClient, user) -> None:
    acme = CompanyFactory(owner=user, name="Acme")
    globex = CompanyFactory(owner=user, name="Globex")
    a = ApplicationFactory(
        owner=user,
        company=acme,
        job_title="Backend Engineer",
        status="applied",
        deadline=date(2026, 5, 1),
    )
    b = ApplicationFactory(
        owner=user,
        company=globex,
        job_title="Data Analyst",
        status="interview",
        deadline=date(2026, 4, 1),
    )
    c = ApplicationFactory(owner=user, company=globex, job_title="Designer", status="saved")

    def ids(query: str) -> list[str]:
        return [r["id"] for r in api.get(f"/api/v1/applications?{query}").json()["results"]]

    assert ids("q=acme") == [str(a.id)]
    assert ids("q=analyst") == [str(b.id)]
    assert set(ids("status=applied,interview")) == {str(a.id), str(b.id)}
    assert ids("ordering=deadline&status=applied,interview") == [str(b.id), str(a.id)]
    assert ids(f"company={globex.id}&ordering=title") == [str(b.id), str(c.id)]
    statuses = [
        r["status"] for r in api.get("/api/v1/applications?ordering=status").json()["results"]
    ]
    assert statuses == ["saved", "applied", "interview"]
    assert ids("deadline_after=2026-04-15") == [str(a.id)]


def test_list_is_paginated(api: APIClient, user) -> None:
    ApplicationFactory.create_batch(30, owner=user)
    page = api.get("/api/v1/applications").json()
    assert page["count"] == 30
    assert len(page["results"]) == 25
    assert len(api.get("/api/v1/applications?page=2").json()["results"]) == 5


def test_list_avoids_n_plus_one(api: APIClient, user, django_assert_max_num_queries) -> None:
    ApplicationFactory.create_batch(15, owner=user)
    with django_assert_max_num_queries(6):
        api.get("/api/v1/applications")


def test_soft_delete_and_restore(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    assert api.delete(f"/api/v1/applications/{app.id}").status_code == 204
    app.refresh_from_db()
    assert app.deleted_at is not None
    assert api.get(f"/api/v1/applications/{app.id}").status_code == 404
    assert api.get("/api/v1/applications").json()["count"] == 0
    trash = api.get("/api/v1/applications?trash=1").json()["results"]
    assert [r["id"] for r in trash] == [str(app.id)]
    restored = api.post(f"/api/v1/applications/{app.id}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None


def test_restore_window_is_thirty_days(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user, deleted_at=timezone.now() - timedelta(days=31))
    response = api.post(f"/api/v1/applications/{app.id}/restore")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "restore_expired"


def test_invalid_id_is_404(api: APIClient) -> None:
    assert api.get("/api/v1/applications/not-a-uuid").status_code == 404


def test_meta_lists_statuses_in_order(api: APIClient) -> None:
    statuses = [s["value"] for s in api.get("/api/v1/meta").json()["statuses"]]
    assert statuses == [
        "saved",
        "preparing",
        "applied",
        "assessment",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
    ]


@freeze_time("2026-06-15 12:00:00")
def test_dashboard_summary(api: APIClient, user) -> None:
    for status in ["saved", "preparing", "applied", "assessment", "interview", "offer", "rejected"]:
        ApplicationFactory(owner=user, status=status)
    ApplicationFactory(owner=user, status="applied", deleted_at=timezone.now())
    app = Application.objects.filter(owner=user, status="applied").first()
    ReminderFactory(application=app, type="follow_up", remind_at=timezone.now() + timedelta(days=2))
    ReminderFactory(
        application=app, type="follow_up", remind_at=timezone.now() + timedelta(days=20)
    )
    ReminderFactory(application=app, type="interview", remind_at=timezone.now() + timedelta(days=1))
    ActivityFactory(application=app, occurred_at=timezone.now() - timedelta(days=1))

    data = api.get("/api/v1/dashboard/summary").json()
    assert data["counts"] == {
        "total": 7,
        "in_progress": 3,
        "interviews": 1,
        "offers": 1,
        "rejections": 1,
        "follow_ups_due": 1,
    }
    assert data["by_status"]["withdrawn"] == 0
    assert len(data["recent"]) == 5
    assert len(data["upcoming_reminders"]) == 3
    assert len(data["activity"]) == 14
    assert data["activity"][-1]["date"] == "2026-06-15"
    assert data["activity"][-2]["count"] == 1
