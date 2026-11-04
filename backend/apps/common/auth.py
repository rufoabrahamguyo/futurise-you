from rest_framework import authentication
from rest_framework.request import Request


class SessionAuthentication(authentication.SessionAuthentication):
    """Session auth with CSRF enforcement that answers 401 (not 403) when signed out."""

    def authenticate_header(self, request: Request) -> str:
        return "Session"
