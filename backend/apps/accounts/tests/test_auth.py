"""FR-01: accounts, sessions and CSRF."""

import re

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User
from tests.factories import PASSWORD, UserFactory

pytestmark = pytest.mark.django_db

STRONG = "a-strong-passphrase-42"


def _link_params(body: str) -> dict[str, str]:
    match = re.search(r"uid=([^&\s]+)&token=([^\s]+)", body)
    assert match, body
    return {"uid": match.group(1), "token": match.group(2)}


def test_register_logs_in_and_sends_verification(
    anon_client: APIClient, django_capture_on_commit_callbacks
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        response = anon_client.post(
            "/api/v1/auth/register",
            {
                "email": "New@Example.com",
                "password": STRONG,
                "full_name": "Ada",
                "timezone": "Europe/London",
            },
        )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["email"] == "new@example.com"
    assert body["is_email_verified"] is False
    assert "password" not in body
    assert anon_client.get("/api/v1/auth/me").status_code == 200
    assert len(mail.outbox) == 1
    assert "verify-email" in mail.outbox[0].body


def test_register_rejects_duplicate_email_and_weak_password(anon_client: APIClient) -> None:
    UserFactory(email="taken@example.com")
    dup = anon_client.post(
        "/api/v1/auth/register", {"email": "TAKEN@example.com", "password": STRONG}
    )
    assert dup.status_code == 400
    assert dup.json()["error"]["code"] == "validation_error"
    weak = anon_client.post(
        "/api/v1/auth/register", {"email": "x@example.com", "password": "12345678"}
    )
    assert weak.status_code == 400


def test_register_rejects_unknown_timezone(anon_client: APIClient) -> None:
    response = anon_client.post(
        "/api/v1/auth/register",
        {"email": "tz@example.com", "password": STRONG, "timezone": "Mars/Base"},
    )
    assert response.status_code == 400
    assert "timezone" in response.json()["error"]["details"]


def test_verify_email(anon_client: APIClient, django_capture_on_commit_callbacks) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        anon_client.post("/api/v1/auth/register", {"email": "v@example.com", "password": STRONG})
    params = _link_params(mail.outbox[0].body)
    assert (
        anon_client.post("/api/v1/auth/verify-email", {**params, "token": "bad-token"}).status_code
        == 400
    )
    assert anon_client.post("/api/v1/auth/verify-email", params).status_code == 204
    assert User.objects.get(email="v@example.com").email_verified_at is not None


def test_login_logout_cycle() -> None:
    user = UserFactory(email="login@example.com")
    client = APIClient()
    bad = client.post("/api/v1/auth/login", {"email": user.email, "password": "wrong-password"})
    assert bad.status_code == 400
    assert bad.json()["error"]["message"] == "Email or password is incorrect."
    ok = client.post("/api/v1/auth/login", {"email": "LOGIN@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.cookies["av_session"]["httponly"]
    assert ok.cookies["av_session"]["samesite"] == "Lax"
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_unauthenticated_requests_get_401_with_error_envelope(anon_client: APIClient) -> None:
    response = anon_client.get("/api/v1/applications")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_login_is_rate_limited() -> None:
    UserFactory(email="rl@example.com")
    client = APIClient()
    codes = [
        client.post(
            "/api/v1/auth/login", {"email": "rl@example.com", "password": "nope"}
        ).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [400] * 5
    assert codes[5] == 429


def test_csrf_is_enforced_for_session_requests(user: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    assert client.patch("/api/v1/auth/me", {"full_name": "No token"}).status_code == 403
    client.get("/api/v1/auth/csrf")
    token = client.cookies["av_csrftoken"].value
    response = client.patch("/api/v1/auth/me", {"full_name": "With token"}, HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200
    assert response.json()["full_name"] == "With token"


def test_update_profile_and_timezone(api: APIClient) -> None:
    response = api.patch(
        "/api/v1/auth/me",
        {"full_name": "Grace", "timezone": "America/New_York", "email_notifications": False},
    )
    assert response.status_code == 200
    assert response.json()["timezone"] == "America/New_York"
    assert response.json()["email_notifications"] is False
    # Email cannot be changed through the profile endpoint.
    api.patch("/api/v1/auth/me", {"email": "changed@example.com"})
    assert api.get("/api/v1/auth/me").json()["email"] != "changed@example.com"


def test_change_password(api: APIClient, user: User) -> None:
    wrong = api.post(
        "/api/v1/auth/change-password", {"current_password": "nope", "new_password": STRONG}
    )
    assert wrong.status_code == 400
    ok = api.post(
        "/api/v1/auth/change-password", {"current_password": PASSWORD, "new_password": STRONG}
    )
    assert ok.status_code == 204
    user.refresh_from_db()
    assert user.check_password(STRONG)
    # The session survives the password change.
    assert api.get("/api/v1/auth/me").status_code == 200


def test_password_reset_flow(anon_client: APIClient, django_capture_on_commit_callbacks) -> None:
    user = UserFactory(email="reset@example.com")
    with django_capture_on_commit_callbacks(execute=True):
        unknown = anon_client.post("/api/v1/auth/password-reset", {"email": "nobody@example.com"})
        known = anon_client.post("/api/v1/auth/password-reset", {"email": "reset@example.com"})
    assert unknown.status_code == known.status_code == 204
    assert len(mail.outbox) == 1
    params = _link_params(mail.outbox[0].body)
    response = anon_client.post(
        "/api/v1/auth/password-reset/confirm", {**params, "new_password": STRONG}
    )
    assert response.status_code == 204
    user.refresh_from_db()
    assert user.check_password(STRONG)
    # The token is single-use: the password hash changed.
    again = anon_client.post(
        "/api/v1/auth/password-reset/confirm", {**params, "new_password": STRONG + "x"}
    )
    assert again.status_code == 400


def test_ai_acknowledgement_is_stored_once(api: APIClient, user: User) -> None:
    first = api.post("/api/v1/auth/ai-acknowledgement").json()["ai_acknowledged_at"]
    second = api.post("/api/v1/auth/ai-acknowledgement").json()["ai_acknowledged_at"]
    assert first is not None and first == second
