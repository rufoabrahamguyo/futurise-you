"""The seed command builds a realistic demo account and is safe to re-run."""

import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.ai.models import InterviewPreparation
from apps.applications.models import Application
from apps.documents.models import ApplicationDocument, DocumentVersion

pytestmark = pytest.mark.django_db


def test_seed_demo(settings, storage) -> None:
    settings.DEMO_USER_PASSWORD = "demo-password-for-tests"
    call_command("seed_demo")
    user = User.objects.get(email=settings.DEMO_USER_EMAIL)
    assert user.check_password("demo-password-for-tests")
    apps = Application.objects.filter(owner=user)
    assert apps.count() == 8
    assert set(apps.values_list("status", flat=True)) == {
        "saved",
        "preparing",
        "applied",
        "assessment",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
    }
    assert ApplicationDocument.objects.filter(application__owner=user, is_frozen=True).exists()
    assert DocumentVersion.objects.filter(document__owner=user, version_number=2).exists()
    assert (
        InterviewPreparation.objects.filter(application__owner=user, status="succeeded").count()
        == 1
    )
    for version in DocumentVersion.objects.filter(document__owner=user):
        assert storage.exists(version.storage_key)

    call_command("seed_demo")  # idempotent
    assert Application.objects.filter(owner=user).count() == 8
    call_command("seed_demo", "--reset")
    assert User.objects.filter(email=settings.DEMO_USER_EMAIL).count() == 1
