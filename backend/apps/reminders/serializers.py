from typing import Any

from rest_framework import serializers

from apps.applications.models import Application

from .models import Channel, Notification, Reminder


class ReminderApplicationSerializer(serializers.ModelSerializer[Application]):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Application
        fields = ["id", "job_title", "company_name", "status"]
        read_only_fields = fields


class ReminderSerializer(serializers.ModelSerializer[Reminder]):
    application = ReminderApplicationSerializer(read_only=True)
    application_id = serializers.UUIDField(write_only=True)
    channels = serializers.ListField(
        child=serializers.ChoiceField(choices=Channel.choices), allow_empty=False
    )

    class Meta:
        model = Reminder
        fields = [
            "id",
            "application",
            "application_id",
            "type",
            "title",
            "notes",
            "remind_at",
            "channels",
            "status",
            "sent_at",
            "completed_at",
            "cancelled_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "sent_at",
            "completed_at",
            "cancelled_at",
            "created_at",
            "updated_at",
        ]

    def validate_application_id(self, value: Any) -> Application:
        application = Application.objects.filter(
            owner=self.context["request"].user, deleted_at__isnull=True, pk=value
        ).first()
        if application is None:
            raise serializers.ValidationError("Application not found.")
        return application

    def validate_channels(self, value: list[str]) -> list[str]:
        return sorted(set(value))

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if "application_id" in attrs:
            attrs["application"] = attrs.pop("application_id")
        return attrs


class NotificationSerializer(serializers.ModelSerializer[Notification]):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "read_at", "created_at"]
        read_only_fields = fields
