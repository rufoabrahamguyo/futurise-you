"""Model factories shared by every test module."""

import hashlib
import io
import uuid
from typing import Any

import factory
from django.utils import timezone as dj_timezone

from apps.accounts.models import User
from apps.applications.models import Application, ApplicationActivity, ApplicationQuestion
from apps.common.storage import get_storage, new_storage_key
from apps.companies.models import Company
from apps.documents.models import ApplicationDocument, Document, DocumentVersion
from apps.jobdescriptions.models import JobDescription
from apps.reminders.models import Reminder

PASSWORD = "correct-horse-battery-staple"


class UserFactory(factory.django.DjangoModelFactory[User]):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    timezone = "UTC"
    email_verified_at = factory.LazyFunction(dj_timezone.now)

    @factory.post_generation
    def password(self, create: bool, extracted: str | None, **kwargs: Any) -> None:
        self.set_password(extracted or PASSWORD)
        if create:
            self.save()


class CompanyFactory(factory.django.DjangoModelFactory[Company]):
    class Meta:
        model = Company

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Company {n}")


class ApplicationFactory(factory.django.DjangoModelFactory[Application]):
    class Meta:
        model = Application

    owner = factory.SubFactory(UserFactory)
    company = factory.LazyAttribute(lambda o: CompanyFactory(owner=o.owner))
    job_title = factory.Sequence(lambda n: f"Software Engineer {n}")
    location = "London"


class ActivityFactory(factory.django.DjangoModelFactory[ApplicationActivity]):
    class Meta:
        model = ApplicationActivity

    application = factory.SubFactory(ApplicationFactory)
    type = "note"
    title = "Spoke to the recruiter"


class QuestionFactory(factory.django.DjangoModelFactory[ApplicationQuestion]):
    class Meta:
        model = ApplicationQuestion

    application = factory.SubFactory(ApplicationFactory)
    question = "Why do you want to work here?"
    answer = "Because of the mission."


class DocumentFactory(factory.django.DjangoModelFactory[Document]):
    class Meta:
        model = Document

    owner = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"CV {n}")
    type = "cv"


def make_version(
    document: Document, *, number: int | None = None, data: bytes | None = None
) -> DocumentVersion:
    data = data or b"%PDF-1.4 test " + uuid.uuid4().bytes
    if number is None:
        number = document.versions.count() + 1
    key = new_storage_key(document.owner_id)
    get_storage().put(key, io.BytesIO(data), "application/pdf")
    return DocumentVersion.objects.create(
        document=document,
        version_number=number,
        storage_key=key,
        original_filename=f"{document.title}.pdf",
        mime_type="application/pdf",
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )


def attach(
    application: Application, version: DocumentVersion, role: str = "cv"
) -> ApplicationDocument:
    return ApplicationDocument.objects.create(
        application=application, document_version=version, role=role
    )


class JobDescriptionFactory(factory.django.DjangoModelFactory[JobDescription]):
    class Meta:
        model = JobDescription

    application = factory.SubFactory(ApplicationFactory)
    source_type = "paste"
    text_source = "paste"
    original_text = "Senior Engineer\nLocation: London\nWe build things."


class ReminderFactory(factory.django.DjangoModelFactory[Reminder]):
    class Meta:
        model = Reminder

    application = factory.SubFactory(ApplicationFactory)
    owner = factory.LazyAttribute(lambda o: o.application.owner)
    type = "follow_up"
    title = "Follow up with recruiter"
    remind_at = factory.LazyFunction(dj_timezone.now)
