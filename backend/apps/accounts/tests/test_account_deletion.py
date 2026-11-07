"""Account deletion removes every record and stored file, through a retrying job."""

from unittest import mock

import pytest
from django.db import models
from rest_framework.test import APIClient

from apps.accounts.deletion import delete_user_data
from apps.accounts.models import User
from apps.applications.models import Application
from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.documents.models import ApplicationDocument, Document, DocumentVersion
from apps.jobdescriptions import services as jd_services
from tests.factories import (
    PASSWORD,
    ApplicationFactory,
    DocumentFactory,
    ReminderFactory,
    UserFactory,
    attach,
    make_version,
)

pytestmark = pytest.mark.django_db


def _populate(user):
    app = ApplicationFactory(owner=user)
    version = make_version(DocumentFactory(owner=user))
    link = attach(app, version)
    # Even frozen submissions are removed: deletion is the deliberate exception to immutability.
    models.QuerySet.update(ApplicationDocument.objects.filter(pk=link.pk), is_frozen=True)
    jd = jd_services.save_uploaded(
        app, validate_file(text_pdf(["Spec"]), "jd.pdf", allow_images=False)
    )
    ReminderFactory(application=app)
    return [version.storage_key, jd.original_file_key]


def test_requires_password_then_deletes_everything(
    api: APIClient, user, storage, django_capture_on_commit_callbacks
) -> None:
    keys = _populate(user)
    other = UserFactory()
    other_keys = _populate(other)

    wrong = api.post("/api/v1/auth/delete-account", {"password": "not-it"})
    assert wrong.status_code == 400
    assert User.objects.filter(pk=user.pk).exists()

    with django_capture_on_commit_callbacks(execute=True):
        response = api.post("/api/v1/auth/delete-account", {"password": PASSWORD})
    assert response.status_code == 202
    assert not User.objects.filter(pk=user.pk).exists()
    assert not Application.objects.filter(owner_id=user.pk).exists()
    assert not DocumentVersion.objects.filter(document__owner_id=user.pk).exists()
    assert all(not storage.exists(k) for k in keys)
    # Other users are untouched.
    assert all(storage.exists(k) for k in other_keys)
    assert Document.objects.filter(owner=other).exists()
    assert api.get("/api/v1/auth/me").status_code == 401


def test_sign_in_is_blocked_while_deletion_runs(api: APIClient, user) -> None:
    with mock.patch("apps.accounts.tasks.delete_account.delay"):
        api.post("/api/v1/auth/delete-account", {"password": PASSWORD})
    user.refresh_from_db()
    assert user.is_active is False
    assert user.deletion_requested_at is not None
    login = APIClient().post("/api/v1/auth/login", {"email": user.email, "password": PASSWORD})
    assert login.status_code == 400


def test_deletion_retries_until_storage_is_clean(user, storage) -> None:
    keys = _populate(user)
    real_delete = storage.delete
    calls = {"n": 0}

    def flaky(key: str) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("storage unavailable")
        real_delete(key)

    with mock.patch.object(storage, "delete", side_effect=flaky), pytest.raises(ConnectionError):
        delete_user_data(user.pk)
    # Nothing was deleted from the database, so the retry still knows every key.
    assert User.objects.filter(pk=user.pk).exists()
    assert delete_user_data(user.pk) is True
    assert all(not storage.exists(k) for k in keys)
    assert delete_user_data(user.pk) is False  # idempotent


def test_task_is_configured_to_retry() -> None:
    from apps.accounts.tasks import delete_account

    assert delete_account.autoretry_for == (Exception,)
    assert delete_account.max_retries >= 5
