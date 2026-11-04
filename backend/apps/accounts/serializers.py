import zoneinfo

from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import User


def validate_timezone_name(value: str) -> str:
    if value not in zoneinfo.available_timezones():
        raise serializers.ValidationError("Choose a valid time zone.")
    return value


class UserSerializer(serializers.ModelSerializer[User]):
    is_email_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "timezone",
            "email_notifications",
            "is_email_verified",
            "ai_acknowledged_at",
            "created_at",
        ]
        read_only_fields = ["id", "email", "is_email_verified", "ai_acknowledged_at", "created_at"]

    def validate_timezone(self, value: str) -> str:
        return validate_timezone_name(value)


class RegisterSerializer(serializers.Serializer[User]):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    full_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    timezone = serializers.CharField(max_length=64, required=False, default="UTC")

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_timezone(self, value: str) -> str:
        return validate_timezone_name(value)

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        candidate = User(email=attrs["email"], full_name=attrs.get("full_name", ""))
        password_validation.validate_password(attrs["password"], candidate)
        return attrs

    def create(self, validated_data: dict[str, str]) -> User:
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer[None]):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer[None]):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate_new_password(self, value: str) -> str:
        password_validation.validate_password(value, self.context["request"].user)
        return value


class PasswordResetRequestSerializer(serializers.Serializer[None]):
    email = serializers.EmailField()


class TokenSerializer(serializers.Serializer[None]):
    uid = serializers.CharField()
    token = serializers.CharField()


class PasswordResetConfirmSerializer(TokenSerializer):
    new_password = serializers.CharField(trim_whitespace=False)


class PasswordConfirmSerializer(serializers.Serializer[None]):
    password = serializers.CharField(trim_whitespace=False)

    def validate_password(self, value: str) -> str:
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your password is incorrect.")
        return value
