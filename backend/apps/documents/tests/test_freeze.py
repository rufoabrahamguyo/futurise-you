"""FR-07: attachments API, freezing on first Applied, 409 on frozen rows, labelling."""

import pytest
from rest_framework.test import APIClient

from apps.applications.models import ApplicationActivity
from apps.documents.models import ApplicationDocument, Document
from tests.factories import ApplicationFactory, DocumentFactory, make_version
from tests.files import PNG_BYTES, pdf_upload, upload

pytestmark = pytest.mark.django_db


def _attach(api: APIClient, app_id, version_id, role: str = "cv"):
    return api.post(
        f"/api/v1/applications/{app_id}/documents",
        {"document_version_id": str(version_id), "role": role},
    )


def test_attach_exact_version_and_list(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    doc = DocumentFactory(owner=user, title="CV")
    v1 = make_version(doc)
    make_version(doc)
    response = _attach(api, app.id, v1.id)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["version"]["version_number"] == 1
    assert body["latest_version_number"] == 2
    assert body["is_frozen"] is False
    assert _attach(api, app.id, v1.id).status_code == 400  # already attached
    assert (
        ApplicationActivity.objects.filter(application=app, type="document_attached").count() == 1
    )


def test_cannot_attach_another_users_version(api: APIClient, user, other_user) -> None:
    app = ApplicationFactory(owner=user)
    foreign = make_version(DocumentFactory(owner=other_user))
    response = _attach(api, app.id, foreign.id)
    assert response.status_code == 400
    assert response.json()["error"]["details"]["document_version_id"] == [
        "Document version not found."
    ]


def test_upload_and_attach_inline(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    response = api.post(
        f"/api/v1/applications/{app.id}/documents/upload",
        {"file": pdf_upload("Tailored CV.pdf"), "role": "cv"},
        format="multipart",
    )
    assert response.status_code == 201, response.json()
    assert response.json()["document_title"] == "Tailored CV"
    assert Document.objects.get(owner=user).is_master is False
    kept = api.post(
        f"/api/v1/applications/{app.id}/documents/upload",
        {
            "file": upload("cert.png", PNG_BYTES),
            "role": "certificate",
            "title": "AWS cert",
            "save_to_library": "true",
        },
        format="multipart",
    )
    assert kept.status_code == 201
    assert Document.objects.get(title="AWS cert").is_master is True


def test_frozen_attachments_return_409(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    link_id = _attach(api, app.id, make_version(DocumentFactory(owner=user)).id).json()["id"]
    api.post(f"/api/v1/applications/{app.id}/status", {"status": "applied"})

    links = api.get(f"/api/v1/applications/{app.id}/documents").json()
    assert links[0]["is_frozen"] is True and links[0]["frozen_at"] is not None

    edit = api.patch(f"/api/v1/applications/{app.id}/documents/{link_id}", {"role": "other"})
    assert edit.status_code == 409
    assert edit.json()["error"]["code"] == "immutable_record"
    remove = api.delete(f"/api/v1/applications/{app.id}/documents/{link_id}")
    assert remove.status_code == 409
    assert ApplicationDocument.objects.get(pk=link_id).role == "cv"


def test_unfrozen_attachments_can_be_changed_and_removed(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    link_id = _attach(api, app.id, make_version(DocumentFactory(owner=user)).id).json()["id"]
    assert (
        api.patch(
            f"/api/v1/applications/{app.id}/documents/{link_id}", {"role": "portfolio"}
        ).json()["role"]
        == "portfolio"
    )
    assert api.delete(f"/api/v1/applications/{app.id}/documents/{link_id}").status_code == 204
    assert ApplicationActivity.objects.filter(application=app, type="document_removed").exists()


def test_files_added_after_submission_are_labelled_and_not_frozen(api: APIClient, user) -> None:
    app = ApplicationFactory(owner=user)
    _attach(api, app.id, make_version(DocumentFactory(owner=user, title="CV")).id)
    api.post(f"/api/v1/applications/{app.id}/status", {"status": "applied"})
    late = _attach(
        api,
        app.id,
        make_version(DocumentFactory(owner=user, title="Portfolio", type="portfolio")).id,
        "portfolio",
    ).json()
    assert late["added_after_submission"] is True
    assert late["is_frozen"] is False
    submitted = ApplicationActivity.objects.get(application=app, type="submitted")
    assert [f["title"] for f in submitted.metadata["files"]] == ["CV"]
    # Moving back and forward never re-freezes or relabels.
    api.post(f"/api/v1/applications/{app.id}/status", {"status": "preparing"})
    api.post(f"/api/v1/applications/{app.id}/status", {"status": "applied"})
    assert ApplicationDocument.objects.get(pk=late["id"]).is_frozen is False


def test_new_library_version_does_not_change_submitted_file(api: APIClient, user, storage) -> None:
    doc_id = api.post(
        "/api/v1/documents",
        {"title": "CV", "type": "cv", "file": pdf_upload("cv.pdf", "Original")},
        format="multipart",
    ).json()["id"]
    v1_id = api.get(f"/api/v1/documents/{doc_id}").json()["versions"][0]["id"]
    app = ApplicationFactory(owner=user)
    _attach(api, app.id, v1_id)
    api.post(f"/api/v1/applications/{app.id}/status", {"status": "applied"})
    api.post(
        f"/api/v1/documents/{doc_id}/versions",
        {"file": pdf_upload("cv.pdf", "Updated")},
        format="multipart",
    )

    link = api.get(f"/api/v1/applications/{app.id}/documents").json()[0]
    assert link["version"]["id"] == v1_id
    assert link["version"]["version_number"] == 1
    assert link["latest_version_number"] == 2
    assert api.get(f"/api/v1/documents/versions/{v1_id}/download").status_code == 200
