"""Every API error uses one envelope: {"error": {"code", "message", "details"}}."""

from typing import Any

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .exceptions import Conflict, ImmutableRecordError

_MESSAGES = {
    "not_found": "Not found.",
    "not_authenticated": "Please sign in to continue.",
    "permission_denied": "You do not have permission to do that.",
    "throttled": "Too many requests. Please wait and try again.",
}


def _first_message(detail: Any) -> str:
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    if isinstance(detail, dict) and detail:
        return _first_message(next(iter(detail.values())))
    return str(detail)


def _first_code(codes: Any) -> str:
    if isinstance(codes, list) and codes:
        return _first_code(codes[0])
    if isinstance(codes, dict) and codes:
        return _first_code(next(iter(codes.values())))
    return str(codes)


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, ImmutableRecordError):
        exc = Conflict(str(exc) or Conflict.default_detail, code="immutable_record")
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    assert isinstance(exc, exceptions.APIException)
    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
        details: Any = exc.detail
        message = _first_message(exc.detail)
    else:
        code = _first_code(exc.get_codes())
        details = {}
        message = _MESSAGES.get(code) or _first_message(exc.detail)
        wait = getattr(exc, "wait", None)
        if isinstance(exc, exceptions.Throttled) and wait is not None:
            details = {"retry_after_seconds": int(wait)}
    response.data = {"error": {"code": code, "message": message, "details": details}}
    return response
