from django.contrib.auth import (
    authenticate,
    login,
    logout,
    password_validation,
    update_session_auth_hash,
)
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.throttles import LoginThrottle, ScopedThrottle

from .emails import send_password_reset_email, send_verification_email
from .google import begin_google_login, finish_google_login
from .models import User
from .serializers import (
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordConfirmSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TokenSerializer,
    UserSerializer,
)
from .tokens import email_verification_token, password_reset_token, user_from_uid


def _user_response(user: User, status_code: int = status.HTTP_200_OK) -> Response:
    return Response(UserSerializer(user).data, status=status_code)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the CSRF cookie. The SPA calls this once before its first unsafe request."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = "register"

    @extend_schema(request=RegisterSerializer, responses={201: UserSerializer})
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        transaction.on_commit(lambda: send_verification_email(user))
        return _user_response(user, status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=LoginSerializer, responses={200: UserSerializer})
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request._request,
            email=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise serializers.ValidationError(
                {"non_field_errors": ["Email or password is incorrect."]},
                code="invalid_credentials",
            )
        login(request, user)
        assert isinstance(user, User)
        return _user_response(user)


class GoogleLoginView(APIView):
    """Starts Google OAuth. The browser is redirected; no JSON body is returned."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(exclude=True)
    def get(self, request: Request) -> HttpResponse:
        return begin_google_login(
            request._request,
            request.query_params.get("next"),
            request.query_params.get("timezone"),
        )


class GoogleCallbackView(APIView):
    """Completes Google OAuth and opens a normal session."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(exclude=True)
    def get(self, request: Request) -> HttpResponse:
        return finish_google_login(
            request._request,
            request.query_params.get("code"),
            request.query_params.get("state"),
        )


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(responses={200: UserSerializer})
    def get(self, request: Request) -> Response:
        user = request.user
        assert isinstance(user, User)
        return _user_response(user)

    @extend_schema(request=UserSerializer, responses={200: UserSerializer})
    def patch(self, request: Request) -> Response:
        user = request.user
        assert isinstance(user, User)
        serializer = UserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PasswordChangeView(APIView):
    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        assert isinstance(user, User)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        update_session_auth_hash(request._request, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=TokenSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = TokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = user_from_uid(serializer.validated_data["uid"])
        if user is None or not email_verification_token.check_token(
            user, serializer.validated_data["token"]
        ):
            raise serializers.ValidationError(
                {"token": ["This verification link is invalid or has expired."]}
            )
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResendVerificationView(APIView):
    throttle_classes = [ScopedThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        user = request.user
        assert isinstance(user, User)
        if not user.is_email_verified:
            send_verification_email(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetRequestSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            transaction.on_commit(lambda: send_password_reset_email(user))
        # Same response whether or not the account exists.
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = user_from_uid(serializer.validated_data["uid"])
        if user is None or not password_reset_token.check_token(
            user, serializer.validated_data["token"]
        ):
            raise serializers.ValidationError(
                {"token": ["This reset link is invalid or has expired."]}
            )
        password_validation.validate_password(serializer.validated_data["new_password"], user)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AIAcknowledgementView(APIView):
    """Records that the user has read the notice about what is sent to the AI provider."""

    @extend_schema(request=None, responses={200: UserSerializer})
    def post(self, request: Request) -> Response:
        user = request.user
        assert isinstance(user, User)
        if user.ai_acknowledged_at is None:
            user.ai_acknowledged_at = timezone.now()
            user.save(update_fields=["ai_acknowledged_at", "updated_at"])
        return _user_response(user)


class DeleteAccountView(APIView):
    """Deletes the account permanently after password confirmation, via a retrying job."""

    throttle_classes = [ScopedThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordConfirmSerializer, responses={202: None})
    def post(self, request: Request) -> Response:
        from functools import partial

        from .tasks import delete_account

        serializer = PasswordConfirmSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        assert isinstance(user, User)
        # Block sign-in immediately; the job then removes everything.
        user.is_active = False
        user.deletion_requested_at = timezone.now()
        user.save(update_fields=["is_active", "deletion_requested_at", "updated_at"])
        transaction.on_commit(partial(delete_account.delay, str(user.pk)))
        logout(request)
        return Response(status=status.HTTP_202_ACCEPTED)
