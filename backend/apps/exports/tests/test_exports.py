"""Data export: a ZIP of records (JSON + CSV) and files, behind an expiring authorized link."""

import csv
import io
import json
import zipfile
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.exports.models import ExportJob
from apps.jobdescriptions import services as jd_services
from apps.reminders.models import Notification
from tests.factories import (
    ActivityFactory,
    ApplicationFactory,
    DocumentFactory,
    QuestionFactory,
    attach,
    make_version,
)

pytestmark = pytest.mark.django_db


def test_export_contains_records_and_files(
    api: APIClient, user, storage, django_capture_on_commit_callbacks
) -> None:
    app = ApplicationFactory(owner=user, job_title="Data Engineer", notes="Great team")
    version = make_version(DocumentFactory(owner=user, title="My CV"), data=b"%PDF-1.4 exact bytes")
    attach(app, version)
    jd_services.save_uploaded(
        app, validate_file(text_pdf(["Spec text"]), "spec.pdf", allow_images=False)
    )
    QuestionFactory(application=app)
    ActivityFactory(application=app, title="Phone screen")

    with django_capture_on_commit_callbacks(execute=True):
        response = api.post("/api/v1/exports")
    assert response.status_code == 202
    job = ExportJob.objects.get(owner=user)
    assert job.status == "succeeded"
    assert job.expires_at is not None
    assert Notification.objects.filter(owner=user, kind="export").exists()

    with zipfile.ZipFile(io.BytesIO(storage.read(job.storage_key))) as archive:
        names = archive.namelist()
        assert {
            "profile.json",
            "applications.json",
            "applications.csv",
            "documents.json",
            "README.txt",
        } <= set(names)
        records = json.loads(archive.read("applications.json"))
        record = records[0]
        assert record["job_title"] == "Data Engineer"
        assert record["notes"] == "Great team"
        assert record["questions"][0]["question"].startswith("Why")
        assert any(t["title"] == "Phone screen" for t in record["timeline"])
        assert "Spec text" in record["job_description"]["original_text"]
        file_path = record["documents"][0]["file"]
        assert archive.read(file_path) == b"%PDF-1.4 exact bytes"
        assert record["job_description"]["original_file"] in names
        rows = list(csv.DictReader(io.StringIO(archive.read("applications.csv").decode())))
        assert rows[0]["job_title"] == "Data Engineer"
        assert json.loads(archive.read("profile.json"))["email"] == user.email


def test_download_link_is_authorized_and_expires(
    api: APIClient, other_api: APIClient, user, django_capture_on_commit_callbacks
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        export_id = api.post("/api/v1/exports").json()["id"]
    listed = api.get("/api/v1/exports").json()
    assert listed[0]["downloadable"] is True
    link = api.get(f"/api/v1/exports/{export_id}/download").json()
    assert int(parse_qs(urlparse(link["url"]).query)["X-Amz-Expires"][0]) <= 300
    assert link["filename"].endswith(".zip")
    assert other_api.get(f"/api/v1/exports/{export_id}/download").status_code == 404
    ExportJob.objects.filter(pk=export_id).update(expires_at=timezone.now() - timedelta(minutes=1))
    expired = api.get(f"/api/v1/exports/{export_id}/download")
    assert expired.status_code == 409
    assert expired.json()["error"]["code"] == "export_unavailable"


def test_one_export_at_a_time(api: APIClient, user) -> None:
    ExportJob.objects.create(owner=user, status="processing")
    response = api.post("/api/v1/exports")
    assert response.status_code == 409


def test_expired_exports_are_purged(user, storage, django_capture_on_commit_callbacks) -> None:
    from apps.exports.tasks import purge_expired_exports

    storage.put("u/x/export", io.BytesIO(b"zip"), "application/zip")
    ExportJob.objects.create(
        owner=user,
        status="succeeded",
        storage_key="u/x/export",
        expires_at=timezone.now() - timedelta(hours=1),
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert purge_expired_exports() == 1
    assert not storage.exists("u/x/export")
