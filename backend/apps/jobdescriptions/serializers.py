from rest_framework import serializers

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
