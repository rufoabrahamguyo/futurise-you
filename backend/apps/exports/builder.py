"""Builds the export ZIP: application records as JSON and CSV, with their files.

The archive is written to a temporary file (spilling to disk past 32 MB) and
streamed to storage, so large exports never sit in memory as one buffer.
"""

import csv
import io
import json
import re
import tempfile
import zipfile
from typing import IO, Any

from django.core.serializers.json import DjangoJSONEncoder

from apps.accounts.models import User
from apps.ai.models import InterviewPreparation
from apps.applications.models import Application
from apps.common.storage import get_storage
from apps.documents.models import ApplicationDocument, Document, DocumentVersion
from apps.jobdescriptions.models import JobDescription
from apps.reminders.models import Reminder

CSV_FIELDS = [
    "id",
    "company",
    "job_title",
    "status",
    "location",
    "employment_type",
    "work_arrangement",
    "compensation",
    "job_url",
    "deadline",
    "date_applied",
    "submitted_at",
    "recruiter_name",
    "recruiter_email",
    "recruiter_phone",
    "created_at",
    "updated_at",
    "deleted_at",
]


def _slug(text: str, fallback: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")[:60]
    return slug or fallback


def _write_json(archive: zipfile.ZipFile, name: str, data: Any) -> None:
    archive.writestr(name, json.dumps(data, cls=DjangoJSONEncoder, indent=2, ensure_ascii=False))


def _copy_file(archive: zipfile.ZipFile, key: str, name: str) -> None:
    with archive.open(name, "w", force_zip64=True) as target:
        for chunk in get_storage().open_stream(key):
            target.write(chunk)


def _version_json(version: DocumentVersion, path: str) -> dict[str, Any]:
    return {
        "version_number": version.version_number,
        "filename": version.original_filename,
        "mime_type": version.mime_type,
        "size": version.size,
        "sha256": version.sha256,
        "uploaded_at": version.created_at,
        "file": path,
    }


def build_export(user: User) -> IO[bytes]:
    """Returns a seekable file containing the ZIP. The caller closes it."""
    output = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)  # noqa: SIM115
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        _write_json(
            archive,
            "profile.json",
            {
                "email": user.email,
                "full_name": user.full_name,
                "timezone": user.timezone,
                "created_at": user.created_at,
                "email_verified_at": user.email_verified_at,
                "ai_acknowledged_at": user.ai_acknowledged_at,
                "email_notifications": user.email_notifications,
            },
        )

        library: list[dict[str, Any]] = []
        version_paths: dict[Any, str] = {}
        for document in (
            Document.objects.filter(owner=user)
            .prefetch_related("versions")
            .order_by("type", "title")
        ):
            name = _slug(document.title, str(document.pk))
            folder = f"documents/{document.type}/{name}-{str(document.pk)[:8]}"
            versions = []
            for version in document.versions.order_by("version_number"):
                path = f"{folder}/v{version.version_number}-{version.original_filename}"
                _copy_file(archive, version.storage_key, path)
                version_paths[version.pk] = path
                versions.append(_version_json(version, path))
            library.append(
                {
                    "title": document.title,
                    "type": document.type,
                    "in_library": document.is_master,
                    "archived_at": document.archived_at,
                    "versions": versions,
                }
            )
        _write_json(archive, "documents.json", library)

        records: list[dict[str, Any]] = []
        csv_buffer = io.StringIO()
        writer = csv.DictWriter(csv_buffer, fieldnames=CSV_FIELDS)
        writer.writeheader()
        applications = (
            Application.objects.filter(owner=user).select_related("company").order_by("created_at")
        )
        for app in applications:
            row = {field: getattr(app, field, "") for field in CSV_FIELDS if field != "company"}
            row["company"] = app.company.name
            writer.writerow(row)
            name = _slug(f"{app.company.name}-{app.job_title}", str(app.pk))
            folder = f"applications/{name}-{str(app.pk)[:8]}"
            record: dict[str, Any] = {**row, "notes": app.notes}

            jd = JobDescription.objects.filter(application=app).first()
            if jd is not None:
                jd_entry: dict[str, Any] = {
                    "source_type": jd.source_type,
                    "original_text": jd.original_text,
                    "text_source": jd.text_source,
                    "ai_suggestion": jd.raw_ai_output,
                    "reviewed_data": jd.reviewed_data,
                    "reviewed_at": jd.reviewed_at,
                }
                if jd.original_text:
                    archive.writestr(f"{folder}/job-description.txt", jd.original_text)
                if jd.original_file_key:
                    path = f"{folder}/job-description-original-{jd.original_filename}"
                    _copy_file(archive, jd.original_file_key, path)
                    jd_entry["original_file"] = path
                record["job_description"] = jd_entry

            record["documents"] = [
                {
                    "role": link.role,
                    "title": link.document_version.document.title,
                    "submitted": link.is_frozen,
                    "submitted_at": link.frozen_at,
                    "added_after_submission": link.added_after_submission,
                    **_version_json(
                        link.document_version, version_paths.get(link.document_version_id, "")
                    ),
                }
                for link in ApplicationDocument.objects.filter(application=app).select_related(
                    "document_version__document"
                )
            ]
            record["questions"] = list(app.questions.values("question", "answer", "order"))
            record["timeline"] = list(
                app.activities.order_by("occurred_at").values(
                    "type", "title", "body", "occurred_at", "is_system_generated"
                )
            )
            record["reminders"] = list(
                Reminder.objects.filter(application=app).values(
                    "type", "title", "notes", "remind_at", "status", "completed_at"
                )
            )
            record["interview_preparation"] = list(
                InterviewPreparation.objects.filter(application=app, status="succeeded").values(
                    "created_at", "content", "user_notes"
                )
            )
            records.append(record)
        _write_json(archive, "applications.json", records)
        archive.writestr("applications.csv", csv_buffer.getvalue())
        archive.writestr(
            "README.txt",
            "KaziTrail export\n\n"
            "profile.json       your account details\n"
            "applications.json  every application with its job description, files,\n"
            "                   questions, timeline and reminders\n"
            "applications.csv   one row per application\n"
            "documents.json     your document library and every version\n"
            "documents/         every file version you uploaded\n"
            "applications/      job description text and original files per application\n",
        )
    output.seek(0)
    return output
