from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.companies.models import Company, get_or_create_company

from .models import MANUAL_ACTIVITY_TYPES, Application, ApplicationActivity, ApplicationQuestion
from .queries import completeness
from .statuses import Status


class CompanySerializer(serializers.ModelSerializer[Company]):
    class Meta:
        model = Company
        fields = ["id", "name"]


class CompletenessItemSerializer(serializers.Serializer[None]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    complete = serializers.BooleanField()


class CompletenessSerializer(serializers.Serializer[None]):
    percent = serializers.IntegerField()
    items = CompletenessItemSerializer(many=True)


class ApplicationListSerializer(serializers.ModelSerializer[Application]):
    company = CompanySerializer(read_only=True)
    completeness = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "company",
            "job_title",
            "location",
            "employment_type",
            "work_arrangement",
            "status",
            "deadline",
            "date_applied",
            "submitted_at",
            "completeness",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = fields

    @extend_schema_field(CompletenessSerializer)
    def get_completeness(self, obj: Application) -> dict[str, object]:
        return completeness(obj)


class ApplicationDetailSerializer(ApplicationListSerializer):
    class Meta(ApplicationListSerializer.Meta):
        fields = [
            *ApplicationListSerializer.Meta.fields,
            "compensation",
            "job_url",
            "recruiter_name",
            "recruiter_email",
            "recruiter_phone",
            "notes",
            "status_changed_at",
        ]
        read_only_fields = fields


class ApplicationWriteSerializer(serializers.ModelSerializer[Application]):
    """Create/update. Status is changed only through the status endpoint."""

    company_id = serializers.UUIDField(required=False, write_only=True)
    company_name = serializers.CharField(max_length=200, required=False, write_only=True)

    class Meta:
        model = Application
        fields = [
            "company_id",
            "company_name",
            "job_title",
            "location",
            "employment_type",
            "work_arrangement",
            "compensation",
            "job_url",
            "deadline",
            "date_applied",
            "recruiter_name",
            "recruiter_email",
            "recruiter_phone",
            "notes",
        ]
        extra_kwargs = {"job_title": {"required": True}}

    def validate_company_id(self, value: Any) -> Company:
        company = Company.objects.filter(owner=self.context["request"].user, pk=value).first()
        if company is None:
            raise serializers.ValidationError("Company not found.")
        return company

    def validate_company_name(self, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Enter a company name.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        company = attrs.pop("company_id", None)
        name = attrs.pop("company_name", None)
        if company is not None and name is not None:
            raise serializers.ValidationError(
                {"company_name": "Choose a company or enter a name, not both."}
            )
        if name is not None:
            company = get_or_create_company(self.context["request"].user, name)
        if company is not None:
            attrs["company"] = company
        elif self.instance is None:
            raise serializers.ValidationError({"company_name": "Enter a company name."})
        return attrs


class StatusChangeSerializer(serializers.Serializer[None]):
    status = serializers.ChoiceField(choices=Status.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=5000, default="")


class StatusChangeResponseSerializer(serializers.Serializer[None]):
    application = ApplicationDetailSerializer()
    warnings = serializers.ListField(child=serializers.CharField())


class ActivitySerializer(serializers.ModelSerializer[ApplicationActivity]):
    class Meta:
        model = ApplicationActivity
        fields = [
            "id",
            "type",
            "title",
            "body",
            "metadata",
            "occurred_at",
            "is_system_generated",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "metadata", "is_system_generated", "created_at", "updated_at"]
        extra_kwargs = {"occurred_at": {"required": False}}

    def validate_type(self, value: str) -> str:
        if value not in MANUAL_ACTIVITY_TYPES:
            raise serializers.ValidationError("This activity type is recorded automatically.")
        return value


class QuestionSerializer(serializers.ModelSerializer[ApplicationQuestion]):
    class Meta:
        model = ApplicationQuestion
        fields = ["id", "question", "answer", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"order": {"required": False}}
