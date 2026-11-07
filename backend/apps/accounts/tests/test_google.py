"""Continue with Google: redirect, verified profile, and a normal session."""

from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def google_settings(settings):
    settings.GOOGLE_CLIENT_ID = "client-id"
    settings.GOOGLE_CLIENT_SECRET = "client-secret"
    settings.FRONTEND_URL = "http://localhost:5173"
    settings.GOOGLE_OAUTH_REDIRECT_URI = ""
    return settings


def _state(response) -> str:
    return parse_qs(urlparse(response["Location"]).query)["state"][0]


def _mock_profile(mock_client: MagicMock, profile: dict) -> None:
    instance = MagicMock()
    mock_client.return_value.__enter__.return_value = instance
    instance.post.return_value.json.return_value = {"access_token": "token"}
    instance.get.return_value.json.return_value = profile


def test_google_is_unavailable_until_configured(anon_client: APIClient) -> None:
    response = anon_client.get("/api/v1/auth/google")
    assert response.status_code == 302
    assert response["Location"] == "/login?error=google_unconfigured"


def test_google_start_redirects_to_google(anon_client: APIClient, google_settings) -> None:
    response = anon_client.get(
        "/api/v1/auth/google", {"timezone": "Europe/London", "next": "/applications"}
    )
    assert response.status_code == 302
    params = parse_qs(urlparse(response["Location"]).query)
    assert response["Location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert params["client_id"] == ["client-id"]
    assert params["redirect_uri"] == ["http://localhost:5173/api/v1/auth/google/callback"]
    assert params["scope"] == ["openid email profile"]
    assert params["state"][0]


@patch("apps.accounts.google.httpx.Client")
def test_callback_creates_a_verified_session(
    mock_client: MagicMock, anon_client: APIClient, google_settings
) -> None:
    start = anon_client.get(
        "/api/v1/auth/google", {"timezone": "Europe/London", "next": "/applications"}
    )
    _mock_profile(
        mock_client,
        {"email": "Ada@Google.com", "email_verified": True, "name": "Ada Lovelace"},
    )
    done = anon_client.get("/api/v1/auth/google/callback", {"code": "abc", "state": _state(start)})
    assert done.status_code == 302
    assert done["Location"] == "/applications"
    user = User.objects.get(email="ada@google.com")
    assert user.full_name == "Ada Lovelace"
    assert user.timezone == "Europe/London"
    assert user.is_email_verified
    assert not user.has_usable_password()
    assert anon_client.get("/api/v1/auth/me").status_code == 200


@patch("apps.accounts.google.httpx.Client")
def test_callback_signs_in_an_existing_account(
    mock_client: MagicMock, anon_client: APIClient, google_settings
) -> None:
    existing = UserFactory(email="ada@google.com", full_name="", email_verified_at=None)
    start = anon_client.get("/api/v1/auth/google", {"next": "//evil.example"})
    _mock_profile(mock_client, {"email": "ada@google.com", "email_verified": True, "name": "Ada"})
    done = anon_client.get("/api/v1/auth/google/callback", {"code": "abc", "state": _state(start)})
    assert done["Location"] == "/dashboard"
    existing.refresh_from_db()
    assert existing.is_email_verified
    assert existing.full_name == "Ada"
    assert existing.has_usable_password()
    assert User.objects.filter(email="ada@google.com").count() == 1


@patch("apps.accounts.google.httpx.Client")
def test_callback_rejects_a_bad_state_or_unverified_email(
    mock_client: MagicMock, anon_client: APIClient, google_settings
) -> None:
    start = anon_client.get("/api/v1/auth/google")
    bad = anon_client.get("/api/v1/auth/google/callback", {"code": "abc", "state": "nope"})
    assert bad["Location"] == "/login?error=google_failed"

    _mock_profile(mock_client, {"email": "ada@google.com", "email_verified": False, "name": "Ada"})
    again = anon_client.get("/api/v1/auth/google")
    unverified = anon_client.get(
        "/api/v1/auth/google/callback", {"code": "abc", "state": _state(again)}
    )
    assert unverified["Location"] == "/login?error=google_email"
    assert User.objects.filter(email="ada@google.com").count() == 0
    assert anon_client.get("/api/v1/auth/me").status_code == 401
    assert start.status_code == 302


def test_callback_records_a_cancelled_google_prompt(
    anon_client: APIClient, google_settings
) -> None:
    anon_client.get("/api/v1/auth/google")
    cancelled = anon_client.get("/api/v1/auth/google/callback", {"error": "access_denied"})
    assert cancelled["Location"] == "/login?error=google_denied"
