"""Soft-deleted applications are purged after 30 days with files nobody else uses."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.applications.models import Application
from apps.applications.tasks import purge_deleted_applications
from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.documents.models import Document, DocumentVersion
from apps.jobdescriptions import services as jd_services
from tests.factories import ApplicationFactory, DocumentFactory, attach, make_version

pytestmark = pytest.mark.django_db


def test_purge_removes_old_trash_and_unreferenced_files(
    storage, django_capture_on_commit_callbacks
) -> None:
    old = ApplicationFactory()
    owner = old.owner
    jd = jd_services.save_uploaded(
        old, validate_file(text_pdf(["Job"]), "jd.pdf", allow_images=False)
    )
    library = make_version(DocumentFactory(owner=owner, title="Library CV"))
    inline = make_version(DocumentFactory(owner=owner, title="Inline", is_master=False))
    shared_inline = make_version(DocumentFactory(owner=owner, title="Shared", is_master=False))
    for version in (library, inline, shared_inline):
        attach(old, version)
    keeper = ApplicationFactory(owner=owner)
    attach(keeper, shared_inline)
    recent = ApplicationFactory(owner=owner)
    attach(recent, make_version(DocumentFactory(owner=owner, is_master=False)))

    Application.objects.filter(pk=old.pk).update(deleted_at=timezone.now() - timedelta(days=31))
    Application.objects.filter(pk=recent.pk).update(deleted_at=timezone.now() - timedelta(days=5))

    with django_capture_on_commit_callbacks(execute=True):
        assert purge_deleted_applications() == 1

    assert not Application.objects.filter(pk=old.pk).exists()
    assert Application.objects.filter(pk=recent.pk).exists()
    assert not storage.exists(jd.original_file_key)
    assert not storage.exists(inline.storage_key)
    assert not DocumentVersion.objects.filter(pk=inline.pk).exists()
    assert not Document.objects.filter(title="Inline").exists()
    # Library documents and versions other applications use are kept.
    assert storage.exists(library.storage_key)
    assert storage.exists(shared_inline.storage_key)


def test_archived_documents_are_cleaned_after_retention(
    storage, django_capture_on_commit_callbacks
) -> None:
    from apps.documents.retention import purge_unreferenced_versions

    doc = DocumentFactory(archived_at=timezone.now() - timedelta(days=40))
    unused = make_version(doc)
    used = make_version(doc)
    attach(ApplicationFactory(owner=doc.owner), used)
    fresh = make_version(DocumentFactory(owner=doc.owner, archived_at=timezone.now()))
    with django_capture_on_commit_callbacks(execute=True):
        assert purge_unreferenced_versions() == 1
    assert not storage.exists(unused.storage_key)
    assert storage.exists(used.storage_key)
    assert storage.exists(fresh.storage_key)
