from rest_framework import serializers

from apps.applications.models import EmploymentType, WorkArrangement

from .models import JobDescription


class JobDescriptionSerializer(serializers.ModelSerializer[JobDescription]):
    has_text = serializers.BooleanField(read_only=True)
    has_file = serializers.BooleanField(read_only=True)

    class Meta:
        model = JobDescription
        fields = [
            "id",
            "source_type",
            "original_text",
            "text_source",
            "has_text",
            "has_file",
            "original_filename",
            "original_file_mime",
            "original_file_size",
            "original_file_sha256",
            "extraction_status",
            "extraction_error",
            "extracted_at",
            "raw_ai_output",
            "reviewed_data",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PasteSerializer(serializers.Serializer[None]):
    text = serializers.CharField(max_length=100_000, trim_whitespace=False)

    def validate_text(self, value: str) -> str:
        if len(value.strip()) < 20:
            raise serializers.ValidationError(
                "Paste the full job description (at least a few lines)."
            )
        return value


class UploadSerializer(serializers.Serializer[None]):
    file = serializers.FileField()


def _list_field() -> serializers.ListField:
    return serializers.ListField(
        child=serializers.CharField(max_length=500, allow_blank=False),
        required=False,
        max_length=60,
        default=list,
    )


class ReviewSerializer(serializers.Serializer[None]):
    """What the user approved. Empty values mean "Not specified"."""

    job_title = serializers.CharField(
        max_length=255, required=False, allow_blank=True, allow_null=True
    )
    company = serializers.CharField(
        max_length=200, required=False, allow_blank=True, allow_null=True
    )
    location = serializers.CharField(
        max_length=255, required=False, allow_blank=True, allow_null=True
    )
    employment_type = serializers.ChoiceField(
        choices=EmploymentType.choices, required=False, allow_blank=True, allow_null=True
    )
    work_arrangement = serializers.ChoiceField(
        choices=WorkArrangement.choices, required=False, allow_blank=True, allow_null=True
    )
    compensation = serializers.CharField(
        max_length=200, required=False, allow_blank=True, allow_null=True
    )
    deadline_text = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    deadline = serializers.DateField(required=False, allow_null=True)
    required_skills = _list_field()
    education = _list_field()
    experience = _list_field()
    responsibilities = _list_field()
    mandatory_requirements = _list_field()
    preferred_qualifications = _list_field()
    eligibility_criteria = _list_field()
    benefits = _list_field()
    required_documents = _list_field()
    application_instructions = _list_field()

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        cleaned: dict[str, object] = {}
        for key, value in attrs.items():
            if isinstance(value, str):
                value = value.strip() or None
            cleaned[key] = value
        return cleaned
