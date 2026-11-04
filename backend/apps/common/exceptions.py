from rest_framework import status
from rest_framework.exceptions import APIException


class ImmutableRecordError(Exception):
    """Raised by the model layer when code tries to change an immutable record."""


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This record cannot be changed."
    default_code = "conflict"


class AIUnavailable(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "You have reached today's AI limit."
    default_code = "ai_daily_limit"
