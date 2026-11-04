"""AI notice acknowledgement and the per-user daily limit."""

import zoneinfo
from datetime import datetime, time

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import User
from apps.common.exceptions import AIUnavailable

from .models import AIUsage


def ensure_acknowledged(user: User) -> None:
    if user.ai_acknowledged_at is None:
        raise PermissionDenied(
            "Please review what is sent to the AI provider before using AI features.",
            code="ai_notice_required",
        )


def _start_of_local_day(user: User) -> datetime:
    tz = zoneinfo.ZoneInfo(user.timezone or "UTC")
    today = timezone.now().astimezone(tz).date()
    return datetime.combine(today, time.min, tzinfo=tz)


def used_today(user: User) -> int:
    return AIUsage.objects.filter(owner=user, created_at__gte=_start_of_local_day(user)).count()


def consume(user: User, feature: str) -> None:
    """Records one AI request, or raises a friendly 429 when today's limit is reached."""
    ensure_acknowledged(user)
    if used_today(user) >= settings.AI_DAILY_LIMIT:
        raise AIUnavailable(
            f"You've used all {settings.AI_DAILY_LIMIT} AI requests for today. "
            "Your limit resets at midnight. You can still enter everything manually.",
            code="ai_daily_limit",
        )
    AIUsage.objects.create(owner=user, feature=feature)
