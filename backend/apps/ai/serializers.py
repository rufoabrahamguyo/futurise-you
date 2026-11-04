from rest_framework import serializers

from .models import InterviewPreparation


class InterviewPreparationSerializer(serializers.ModelSerializer[InterviewPreparation]):
    class Meta:
        model = InterviewPreparation
        fields = [
            "id",
            "status",
            "content",
            "input_references",
            "missing_inputs",
            "user_notes",
            "error",
            "model_name",
            "prompt_version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [f for f in fields if f != "user_notes"]


class AIUsageSerializer(serializers.Serializer[None]):
    used_today = serializers.IntegerField()
    daily_limit = serializers.IntegerField()
