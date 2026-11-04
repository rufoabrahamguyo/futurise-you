from typing import TYPE_CHECKING

from rest_framework import authentication
from rest_framework.exceptions import NotAuthenticated
from rest_framework.request import Request

if TYPE_CHECKING:
    from apps.accounts.models import User


class SessionAuthentication(authentication.SessionAuthentication):
    """Session auth with CSRF enforcement that answers 401 (not 403) when signed out."""

    def authenticate_header(self, request: Request) -> str:
        return "Session"


def request_user(request: Request) -> "User":
    """The authenticated user. Views behind IsAuthenticated never see AnonymousUser."""
    from apps.accounts.models import User

    user = request.user
    if not isinstance(user, User):
        raise NotAuthenticated()
    return user
