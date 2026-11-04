import uuid
from collections.abc import Callable

import structlog
from django.http import HttpRequest, HttpResponse

_HEADER = "HTTP_X_REQUEST_ID"


class RequestIdMiddleware:
    """Binds a request ID to every log line and echoes it in the response."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        incoming = request.META.get(_HEADER, "")
        request_id = (
            incoming if 8 <= len(incoming) <= 64 and incoming.isalnum() else uuid.uuid4().hex
        )
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response
