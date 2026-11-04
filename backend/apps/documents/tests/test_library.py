"""FR-06: document library, immutable versions, archive, private downloads."""

from urllib.parse import parse_qs, urlparse

import pytest
from rest_framework.test import APIClient

from apps.common.storage import user_prefix
from apps.documents.models import Document, DocumentVersion
from tests.factories import ApplicationFactory, DocumentFactory, attach, make_version
from tests.files import LEGACY_DOC_BYTES, PNG_BYTES, docx_upload, pdf_upload, upload

pytestmark = pytest.mark.django_db


def test_upload_creates_document_with_version_one(api: APIClient, user, storage) -> None:
    response = api.post(
        "/api/v1/documents",
        {"title": "My CV", "type": "cv", "file": pdf_upload("Ada CV.pdf")},
        format="multipart",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["version_count"] == 1
    version = body["versions"][0]
    assert version["version_number"] == 1
    assert version["original_filename"] == "Ada CV.pdf"
    assert version["previewable"] is True
    assert "storage_key" not in version and "storage_key" not in body
    stored = DocumentVersion.objects.get(pk=version["id"])
    assert stored.storage_key.startswith(user_prefix(user.id))
    assert str(user.id) not in stored.storage_key
    assert storage.exists(stored.storage_key)


def test_new_version_never_overwrites(api: APIClient, user, storage) -> None:
    doc_id = api.post(
        "/api/v1/documents",
        {"title": "CV", "type": "cv", "file": pdf_upload("v1.pdf", "first")},
        format="multipart",
    ).json()["id"]
    v1 = DocumentVersion.objects.get(document_id=doc_id)
    v1_bytes = storage.read(v1.storage_key)
    response = api.post(
        f"/api/v1/documents/{doc_id}/versions",
        {"file": pdf_upload("v2.pdf", "second")},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.json()["version_number"] == 2
    v2 = DocumentVersion.objects.get(pk=response.json()["id"])
    assert v2.storage_key != v1.storage_key
    assert storage.read(v1.storage_key) == v1_bytes
    versions = api.get(f"/api/v1/documents/{doc_id}/versions").json()
    assert [v["version_number"] for v in versions] == [2, 1]


def test_docx_and_image_rules_by_type(api: APIClient) -> None:
    assert (
        api.post(
            "/api/v1/documents",
            {"title": "Letter", "type": "cover_letter", "file": docx_upload()},
            format="multipart",
        ).status_code
        == 201
    )
    cert = api.post(
        "/api/v1/documents",
        {"title": "Cert", "type": "certificate", "file": upload("cert.png", PNG_BYTES)},
        format="multipart",
    )
    assert cert.status_code == 201
    cv_image = api.post(
        "/api/v1/documents",
        {"title": "CV", "type": "cv", "file": upload("cv.png", PNG_BYTES)},
        format="multipart",
    )
    assert cv_image.status_code == 400
    legacy = api.post(
        "/api/v1/documents",
        {"title": "Old", "type": "cv", "file": upload("old.doc", LEGACY_DOC_BYTES)},
        format="multipart",
    )
    assert legacy.status_code == 400
    assert "Legacy Word files" in legacy.json()["error"]["message"]


def test_rename_but_not_change_type(api: APIClient, user) -> None:
    doc = DocumentFactory(owner=user)
    make_version(doc)
    body = api.patch(f"/api/v1/documents/{doc.id}", {"title": "Renamed", "type": "other"}).json()
    assert body["title"] == "Renamed"
    assert body["type"] == "cv"


def test_list_groups_and_filters(api: APIClient, user) -> None:
    make_version(DocumentFactory(owner=user, type="cv", title="B CV"))
    make_version(DocumentFactory(owner=user, type="cover_letter", title="A Letter"))
    make_version(DocumentFactory(owner=user, type="cv", title="Inline", is_master=False))
    results = api.get("/api/v1/documents").json()["results"]
    assert [(d["type"], d["title"]) for d in results] == [
        ("cover_letter", "A Letter"),
        ("cv", "B CV"),
    ]
    assert results[0]["latest_version"]["version_number"] == 1
    assert len(api.get("/api/v1/documents?type=cv").json()["results"]) == 1
    assert len(api.get("/api/v1/documents?include_non_master=1").json()["results"]) == 3


def test_archive_keeps_versions_used_by_applications(api: APIClient, user) -> None:
    doc = DocumentFactory(owner=user)
    version = make_version(doc)
    app = ApplicationFactory(owner=user)
    attach(app, version)
    assert api.delete(f"/api/v1/documents/{doc.id}").status_code == 204
    doc.refresh_from_db()
    assert doc.archived_at is not None
    assert api.get("/api/v1/documents").json()["count"] == 0
    assert api.get("/api/v1/documents?archived=1").json()["count"] == 1
    # Still listed and downloadable from the application.
    links = api.get(f"/api/v1/applications/{app.id}/documents").json()
    assert links[0]["document_archived"] is True
    assert api.get(f"/api/v1/documents/versions/{version.id}/download").status_code == 200
    # Archived documents don't take new versions.
    assert (
        api.post(
            f"/api/v1/documents/{doc.id}/versions", {"file": pdf_upload()}, format="multipart"
        ).status_code
        == 400
    )


def test_download_returns_short_lived_presigned_url(api: APIClient, user) -> None:
    version = make_version(DocumentFactory(owner=user, title="Ada CV"))
    body = api.get(f"/api/v1/documents/versions/{version.id}/download?inline=1").json()
    assert body["expires_in"] <= 300
    query = parse_qs(urlparse(body["url"]).query)
    assert int(query["X-Amz-Expires"][0]) <= 300
    assert query["response-content-disposition"][0].startswith("inline;")
    assert version.storage_key not in body["url"]
    attachment = api.get(f"/api/v1/documents/versions/{version.id}/download").json()
    assert (
        "attachment;"
        in parse_qs(urlparse(attachment["url"]).query)["response-content-disposition"][0]
    )


def test_detail_lists_versions_and_usages(api: APIClient, user) -> None:
    doc = DocumentFactory(owner=user)
    v1 = make_version(doc)
    make_version(doc)
    app = ApplicationFactory(owner=user, job_title="Analyst")
    attach(app, v1)
    body = api.get(f"/api/v1/documents/{doc.id}").json()
    assert [v["version_number"] for v in body["versions"]] == [2, 1]
    assert body["usages"] == [
        {
            "application_id": str(app.id),
            "job_title": "Analyst",
            "company_name": app.company.name,
            "version_number": 1,
            "is_frozen": False,
        }
    ]
    assert body["application_count"] == 1


def test_upload_is_rate_limited(api: APIClient, monkeypatch) -> None:
    from rest_framework.throttling import SimpleRateThrottle

    monkeypatch.setattr(
        SimpleRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, "upload": "2/h"}
    )
    codes = [
        api.post(
            "/api/v1/documents",
            {"title": "CV", "type": "cv", "file": pdf_upload()},
            format="multipart",
        ).status_code
        for _ in range(3)
    ]
    assert codes == [201, 201, 429]
    assert Document.objects.count() == 2
