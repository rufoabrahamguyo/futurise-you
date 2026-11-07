"""Google OAuth sign-in.

The browser stays on the frontend origin so the session cookie is first-party.
"""

import secrets
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from django.conf import settings
from django.contrib.auth import login
from django.db import IntegrityError, transaction
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.utils import timezone

from .models import User

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_EXCHANGE_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

_STATE = "google_oauth_state"
_NEXT = "google_oauth_next"
_TZ = "google_oauth_tz"


class GoogleAuthError(Exception):
    """The Google exchange failed or the profile cannot be used to sign in."""


def google_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def redirect_uri() -> str:
    configured = settings.GOOGLE_OAUTH_REDIRECT_URI
    if configured:
        return configured
    return f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/auth/google/callback"


def safe_next(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/dashboard"
    return value


def clean_timezone(value: str | None) -> str:
    candidate = (value or "UTC").strip()[:64] or "UTC"
    try:
        ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return "UTC"
    return candidate


def _states_match(expected: object, got: str) -> bool:
    if not isinstance(expected, str) or len(expected) != len(got):
        return False
    return secrets.compare_digest(expected, got)


def begin_google_login(
    request: HttpRequest, next_path: str | None, time_zone: str | None
) -> HttpResponse:
    if not google_configured():
        return HttpResponseRedirect("/login?error=google_unconfigured")
    state = secrets.token_urlsafe(32)
    request.session[_STATE] = state
    request.session[_NEXT] = safe_next(next_path)
    request.session[_TZ] = clean_timezone(time_zone)
    query = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return HttpResponseRedirect(f"{_AUTH_URL}?{query}")


def _profile(code: str) -> dict[str, object]:
    try:
        with httpx.Client(timeout=10) as client:
            token_response = client.post(
                _EXCHANGE_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": redirect_uri(),
                    "grant_type": "authorization_code",
                },
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise GoogleAuthError("Google did not return an access token.")
            profile_response = client.get(
                _USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            profile_response.raise_for_status()
            profile = profile_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GoogleAuthError("Google sign-in failed.") from exc
    if not isinstance(profile, dict):
        raise GoogleAuthError("Google returned an unexpected profile.")
    return profile


def _login_error(request: HttpRequest, code: str) -> HttpResponseRedirect:
    request.session.pop(_STATE, None)
    request.session.pop(_NEXT, None)
    request.session.pop(_TZ, None)
    return HttpResponseRedirect(f"/login?error={code}")


def finish_google_login(request: HttpRequest, code: str | None, state: str | None) -> HttpResponse:
    if request.GET.get("error") == "access_denied":
        return _login_error(request, "google_denied")
    expected = request.session.get(_STATE)
    if not code or not state or not _states_match(expected, state):
        return _login_error(request, "google_failed")
    stored_next = request.session.get(_NEXT)
    stored_tz = request.session.get(_TZ)
    next_path = safe_next(stored_next if isinstance(stored_next, str) else None)
    time_zone = clean_timezone(stored_tz if isinstance(stored_tz, str) else None)
    request.session.pop(_STATE, None)
    request.session.pop(_NEXT, None)
    request.session.pop(_TZ, None)

    try:
        profile = _profile(code)
    except GoogleAuthError:
        return HttpResponseRedirect("/login?error=google_failed")

    email = profile.get("email")
    verified = profile.get("email_verified")
    if not isinstance(email, str) or verified not in (True, "true"):
        return HttpResponseRedirect("/login?error=google_email")
    name = profile.get("name")
    full_name = name.strip()[:200] if isinstance(name, str) else ""

    with transaction.atomic():
        user = User.objects.filter(email__iexact=email.strip()).first()
        if user is None:
            try:
                with transaction.atomic():
                    user = User.objects.create_user(
                        email=email,
                        password=None,
                        full_name=full_name,
                        timezone=time_zone,
                        email_verified_at=timezone.now(),
                    )
            except IntegrityError:
                user = User.objects.filter(email__iexact=email.strip()).first()
                if user is None or not user.is_active:
                    return HttpResponseRedirect("/login?error=google_failed")
        elif not user.is_active:
            return HttpResponseRedirect("/login?error=google_inactive")
        else:
            updates: list[str] = []
            if user.email_verified_at is None:
                user.email_verified_at = timezone.now()
                updates.append("email_verified_at")
            if not user.full_name and full_name:
                user.full_name = full_name
                updates.append("full_name")
            if updates:
                updates.append("updated_at")
                user.save(update_fields=updates)

    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return HttpResponseRedirect(next_path)
