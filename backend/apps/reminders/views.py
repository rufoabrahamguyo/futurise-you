from typing import Any

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.auth import request_user
from apps.common.exceptions import Conflict

from . import services
from .models import Notification, Reminder, ReminderStatus
from .serializers import NotificationSerializer, ReminderSerializer

SCOPES = ("upcoming", "overdue", "completed", "cancelled", "open")


class ReminderViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet[Reminder],
):
    serializer_class = ReminderSerializer
    http_method_names = ["get", "post", "patch"]
    lookup_value_regex = "[0-9a-fA-F-]{36}"

    def get_queryset(self) -> QuerySet[Reminder]:
        return Reminder.objects.filter(
            owner=request_user(self.request), application__deleted_at__isnull=True
        ).select_related("application__company")

    def filter_queryset(self, queryset: QuerySet[Reminder]) -> QuerySet[Reminder]:  # type: ignore[override]
        if self.action != "list":
            return queryset
        params = self.request.query_params
        now = timezone.now()
        scope = params.get("scope")
        if scope == "upcoming":
            queryset = queryset.filter(status__in=services.OPEN, remind_at__gte=now)
        elif scope == "overdue":
            queryset = queryset.filter(status__in=services.OPEN, remind_at__lt=now)
        elif scope == "open":
            queryset = queryset.filter(status__in=services.OPEN)
        elif scope == "completed":
            queryset = queryset.filter(status=ReminderStatus.COMPLETED).order_by("-completed_at")
        elif scope == "cancelled":
            queryset = queryset.filter(status=ReminderStatus.CANCELLED).order_by("-cancelled_at")
        if application := params.get("application"):
            queryset = queryset.filter(application_id=application)
        if start := params.get("from"):
            queryset = queryset.filter(remind_at__date__gte=start)
        if end := params.get("to"):
            queryset = queryset.filter(remind_at__date__lte=end)
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter("scope", str, enum=list(SCOPES)),
            OpenApiParameter("application", OpenApiTypes.UUID),
            OpenApiParameter("from", OpenApiTypes.DATE),
            OpenApiParameter("to", OpenApiTypes.DATE),
        ]
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer: Any) -> None:
        serializer.save(owner=request_user(self.request))

    def perform_update(self, serializer: Any) -> None:
        reminder = serializer.instance
        if reminder.status in (ReminderStatus.COMPLETED, ReminderStatus.CANCELLED):
            raise Conflict(
                "Completed or cancelled reminders cannot be edited.", code="reminder_closed"
            )
        changes: dict[str, Any] = {}
        # Moving a sent reminder to a later time schedules it again.
        new_time = serializer.validated_data.get("remind_at")
        if new_time is not None and new_time != reminder.remind_at:
            changes = {"status": ReminderStatus.PENDING, "sent_at": None, "email_sent_at": None}
            # The old notification described the old time; a new one is sent when due.
            Notification.objects.filter(reminder=reminder).delete()
        serializer.save(**changes)

    @extend_schema(request=None, responses={200: ReminderSerializer})
    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: Any = None) -> Response:
        reminder = services.complete(self.get_object())
        return Response(ReminderSerializer(self._reload(reminder)).data)

    @extend_schema(request=None, responses={200: ReminderSerializer})
    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: Any = None) -> Response:
        reminder = services.cancel(self.get_object())
        return Response(ReminderSerializer(self._reload(reminder)).data)

    def _reload(self, reminder: Reminder) -> Reminder:
        return self.get_queryset().get(pk=reminder.pk)


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet[Notification]):
    serializer_class = NotificationSerializer
    lookup_value_regex = "[0-9a-fA-F-]{36}"

    def get_queryset(self) -> QuerySet[Notification]:
        return Notification.objects.filter(owner=request_user(self.request))

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request: Request) -> Response:
        return Response({"count": self.get_queryset().filter(read_at__isnull=True).count()})

    @extend_schema(request=None, responses={200: NotificationSerializer})
    @action(detail=True, methods=["post"])
    def read(self, request: Request, pk: Any = None) -> Response:
        notification = get_object_or_404(self.get_queryset(), pk=pk)
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationSerializer(notification).data)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request: Request) -> Response:
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
