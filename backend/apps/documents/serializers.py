from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.common.files import PREVIEWABLE

from .models import ApplicationDocument, Document, DocumentType, DocumentVersion


class VersionSerializer(serializers.ModelSerializer[DocumentVersion]):
    """Version metadata. The storage key is never exposed."""

    previewable = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "version_number",
            "original_filename",
            "mime_type",
            "size",
            "sha256",
            "created_at",
            "previewable",
        ]
        read_only_fields = fields

    def get_previewable(self, obj: DocumentVersion) -> bool:
        return obj.mime_type in PREVIEWABLE


class UsageSerializer(serializers.Serializer[None]):
    application_id = serializers.UUIDField()
    job_title = serializers.CharField()
    company_name = serializers.CharField()
    version_number = serializers.IntegerField()
    is_frozen = serializers.BooleanField()


class DocumentSerializer(serializers.ModelSerializer[Document]):
    latest_version = serializers.SerializerMethodField()
    version_count = serializers.IntegerField(read_only=True, default=0)
    application_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "type",
            "is_master",
            "archived_at",
            "created_at",
            "updated_at",
            "latest_version",
            "version_count",
            "application_count",
        ]
        read_only_fields = ["id", "type", "is_master", "archived_at", "created_at", "updated_at"]

    @extend_schema_field(VersionSerializer(allow_null=True))
    def get_latest_version(self, obj: Document) -> dict[str, Any] | None:
        versions = getattr(obj, "prefetched_versions", None)
        latest = versions[0] if versions else obj.versions.order_by("-version_number").first()
        return VersionSerializer(latest).data if latest else None


class DocumentDetailSerializer(DocumentSerializer):
    versions = serializers.SerializerMethodField()
    usages = serializers.SerializerMethodField()

    class Meta(DocumentSerializer.Meta):
        fields = [*DocumentSerializer.Meta.fields, "versions", "usages"]

    @extend_schema_field(VersionSerializer(many=True))
    def get_versions(self, obj: Document) -> list[dict[str, Any]]:
        return list(VersionSerializer(obj.versions.order_by("-version_number"), many=True).data)

    @extend_schema_field(UsageSerializer(many=True))
    def get_usages(self, obj: Document) -> list[dict[str, Any]]:
        links = (
            ApplicationDocument.objects.filter(
                document_version__document=obj, application__deleted_at__isnull=True
            )
            .select_related("application__company", "document_version")
            .order_by("-application__updated_at")
        )
        return [
            {
                "application_id": link.application_id,
                "job_title": link.application.job_title,
                "company_name": link.application.company.name,
                "version_number": link.document_version.version_number,
                "is_frozen": link.is_frozen,
            }
            for link in links
        ]


class DocumentCreateSerializer(serializers.Serializer[None]):
    title = serializers.CharField(max_length=200)
    type = serializers.ChoiceField(choices=DocumentType.choices)
    file = serializers.FileField()


class VersionCreateSerializer(serializers.Serializer[None]):
    file = serializers.FileField()


class DownloadSerializer(serializers.Serializer[None]):
    url = serializers.URLField()
    expires_in = serializers.IntegerField()
    filename = serializers.CharField()
    mime_type = serializers.CharField()


class ApplicationDocumentSerializer(serializers.ModelSerializer[ApplicationDocument]):
    version = VersionSerializer(source="document_version", read_only=True)
    document_id = serializers.UUIDField(source="document_version.document_id", read_only=True)
    document_title = serializers.CharField(source="document_version.document.title", read_only=True)
    document_archived = serializers.SerializerMethodField()
    latest_version_number = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = ApplicationDocument
        fields = [
            "id",
            "role",
            "is_frozen",
            "frozen_at",
            "added_after_submission",
            "created_at",
            "document_id",
            "document_title",
            "document_archived",
            "latest_version_number",
            "version",
        ]
        read_only_fields = fields

    def get_document_archived(self, obj: ApplicationDocument) -> bool:
        return obj.document_version.document.archived_at is not None


class AttachSerializer(serializers.Serializer[None]):
    document_version_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=DocumentType.choices)

    def validate_document_version_id(self, value: Any) -> DocumentVersion:
        version = (
            DocumentVersion.objects.filter(document__owner=self.context["request"].user, pk=value)
            .select_related("document")
            .first()
        )
        if version is None:
            raise serializers.ValidationError("Document version not found.")
        return version


class AttachUploadSerializer(serializers.Serializer[None]):
    file = serializers.FileField()
    role = serializers.ChoiceField(choices=DocumentType.choices)
    title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    save_to_library = serializers.BooleanField(default=False)


class RoleSerializer(serializers.Serializer[None]):
    role = serializers.ChoiceField(choices=DocumentType.choices)
