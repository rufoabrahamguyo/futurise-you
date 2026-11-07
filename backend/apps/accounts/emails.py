from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import User
from .tokens import email_verification_token, encode_uid, password_reset_token


def _send(user: User, subject: str, template: str, context: dict[str, str]) -> None:
    body = render_to_string(template, {"user": user, **context})
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email])


def send_verification_email(user: User) -> None:
    token = email_verification_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/verify-email?uid={encode_uid(user)}&token={token}"
    _send(user, "Confirm your KaziTrail email", "emails/verify_email.txt", {"link": link})


def send_password_reset_email(user: User) -> None:
    token = password_reset_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={encode_uid(user)}&token={token}"
    _send(user, "Reset your KaziTrail password", "emails/password_reset.txt", {"link": link})
