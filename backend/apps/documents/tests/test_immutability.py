"""FR-06 / FR-07: immutability enforced at the model layer, not only in the API."""

import pytest

from apps.common.exceptions import ImmutableRecordError
from apps.documents.models import ApplicationDocument, DocumentVersion
from tests.factories import ApplicationFactory, DocumentFactory, attach, make_version

pytestmark = pytest.mark.django_db


def test_document_versions_cannot_be_changed_or_deleted() -> None:
    version = make_version(DocumentFactory())
    version.original_filename = "changed.pdf"
    with pytest.raises(ImmutableRecordError):
        version.save()
    with pytest.raises(ImmutableRecordError):
        version.delete()
    with pytest.raises(ImmutableRecordError):
        DocumentVersion.objects.filter(pk=version.pk).update(storage_key="other")
    with pytest.raises(ImmutableRecordError):
        DocumentVersion.objects.filter(pk=version.pk).delete()
    version.refresh_from_db()
    assert version.original_filename.endswith(".pdf") and version.original_filename != "changed.pdf"


def test_version_numbers_are_unique_per_document() -> None:
    from django.db import IntegrityError

    doc = DocumentFactory()
    make_version(doc, number=1)
    with pytest.raises(IntegrityError):
        make_version(doc, number=1)


def test_frozen_attachments_cannot_be_changed_or_removed() -> None:
    app = ApplicationFactory()
    link = attach(app, make_version(DocumentFactory(owner=app.owner)))
    ApplicationDocument.objects.filter(pk=link.pk).update(is_frozen=True)
    link.refresh_from_db()
    link.role = "other"
    with pytest.raises(ImmutableRecordError):
        link.save()
    with pytest.raises(ImmutableRecordError):
        link.delete()
    with pytest.raises(ImmutableRecordError):
        ApplicationDocument.objects.filter(pk=link.pk).update(is_frozen=False)
    with pytest.raises(ImmutableRecordError):
        ApplicationDocument.objects.filter(application=app).delete()


def test_referenced_versions_cannot_be_deleted_directly() -> None:
    from django.db.models import RestrictedError

    app = ApplicationFactory()
    version = make_version(DocumentFactory(owner=app.owner))
    attach(app, version)
    with pytest.raises(RestrictedError):
        version.document.delete()
