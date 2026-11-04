"""FR-02 / FR-07: status changes create activities; first Applied freezes attachments."""

from datetime import date

import pytest
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.applications.models import ApplicationActivity
from apps.documents.models import ApplicationDocument
from tests.factories import ApplicationFactory, DocumentFactory, UserFactory, attach, make_version

pytestmark = pytest.mark.django_db


def _status(api: APIClient, app_id, status: str, note: str = "") -> dict:
    response = api.post(f"/api/v1/applications/{app_id}/status", {"status": status, "note": note})
    assert response.status_code == 200, response.json()
    return response.json()


def test_every_status_change_creates_system_activity(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    _status(api, app.id, "preparing", note="Tailoring CV")
    _status(api, app.id, "saved")
    activities = ApplicationActivity.objects.filter(application=app, type="status_change").order_by(
        "occurred_at"
    )
    assert [(a.metadata["from"], a.metadata["to"]) for a in activities] == [
        ("saved", "preparing"),
        ("preparing", "saved"),
    ]
    assert all(a.is_system_generated for a in activities)
    assert activities[0].body == "Tailoring CV"
    assert activities[0].title == "Status changed from Saved to Preparing"


def test_same_status_is_a_no_op(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user, status="preparing")
    _status(api, app.id, "preparing")
    assert not ApplicationActivity.objects.filter(application=app, type="status_change").exists()


def test_any_status_can_move_to_any_status(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    for status in ["offer", "saved", "withdrawn", "assessment"]:
        assert _status(api, app.id, status)["application"]["status"] == status


def test_rejects_unknown_status(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(f"/api/v1/applications/{app.id}/status", {"status": "ghosted"})
    assert response.status_code == 400


@freeze_time("2026-03-10 23:30:00")
def test_first_applied_freezes_attachments_and_sets_date(api: APIClient) -> None:
    user = UserFactory(timezone="Asia/Tokyo")  # already 11 March in Tokyo
    api.force_login(user)
    app = ApplicationFactory(owner=user, status="preparing")
    cv = make_version(DocumentFactory(owner=user, title="CV"))
    letter = make_version(DocumentFactory(owner=user, title="Letter", type="cover_letter"))
    attach(app, cv, "cv")
    attach(app, letter, "cover_letter")

    body = _status(api, app.id, "applied")
    assert body["warnings"] == []
    assert body["application"]["date_applied"] == "2026-03-11"
    assert body["application"]["submitted_at"] is not None
    assert ApplicationDocument.objects.filter(application=app, is_frozen=True).count() == 2

    submitted = ApplicationActivity.objects.get(application=app, type="submitted")
    files = submitted.metadata["files"]
    assert {(f["filename"], f["version_number"]) for f in files} == {
        ("CV.pdf", 1),
        ("Letter.pdf", 1),
    }
    assert "CV.pdf (version 1)" in submitted.body


def test_existing_date_applied_is_kept(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user, date_applied=date(2026, 1, 2))
    assert _status(api, app.id, "applied")["application"]["date_applied"] == "2026-01-02"


def test_applied_without_cv_warns_but_continues(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    body = _status(api, app.id, "applied")
    assert body["warnings"] == ["no_cv"]
    assert body["application"]["status"] == "applied"


def test_moving_back_does_not_unfreeze_or_refreeze(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    attach(app, make_version(DocumentFactory(owner=user)))
    _status(api, app.id, "applied")
    _status(api, app.id, "preparing")
    assert ApplicationDocument.objects.get(application=app).is_frozen is True
    _status(api, app.id, "applied")
    assert ApplicationActivity.objects.filter(application=app, type="submitted").count() == 1
