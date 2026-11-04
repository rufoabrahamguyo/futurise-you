"""Rate limits. Rates accept multi-unit periods such as "5/15m"."""

import re

from rest_framework.request import Request
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}
_RATE = re.compile(r"^(\d+)/(\d*)([smhd])")


def parse_rate(rate: str | None) -> tuple[int | None, int | None]:
    if rate is None:
        return None, None
    match = _RATE.match(rate)
    if not match:
        raise ValueError(f"Invalid throttle rate: {rate}")
    count, multiplier, unit = match.groups()
    return int(count), int(multiplier or 1) * _UNITS[unit]


class _MultiUnitMixin:
    def parse_rate(self, rate: str | None) -> tuple[int | None, int | None]:
        return parse_rate(rate)


class ScopedThrottle(_MultiUnitMixin, ScopedRateThrottle):
    """Per-user (or per-IP when anonymous) throttle selected by `throttle_scope`."""


class LoginThrottle(_MultiUnitMixin, SimpleRateThrottle):
    """Limits sign-in attempts per IP address and email together."""

    scope = "login"

    def get_cache_key(self, request: Request, view: APIView) -> str | None:
        data = request.data if isinstance(request.data, dict) else {}
        email = str(data.get("email", "")).strip().lower()
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{self.get_ident(request)}:{email}",
        }
