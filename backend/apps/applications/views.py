import zoneinfo
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db.models import Count, Q, QuerySet
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.common.exceptions import Conflict

from . import services
from .models import (
    MANUAL_ACTIVITY_TYPES,
    ActivityType,
    Application,
    ApplicationActivity,
    ApplicationQuerySet,
    ApplicationQuestion,
    EmploymentType,
    WorkArrangement,
)
from .queries import status_rank, with_record_flags
from .serializers import (
    ActivitySerializer,
    ApplicationDetailSerializer,
    ApplicationListSerializer,
    ApplicationWriteSerializer,
    QuestionSerializer,
    StatusChangeResponseSerializer,
    StatusChangeSerializer,
)
from .statuses import IN_PROGRESS, STATUS_ORDER, Status

ORDERING = {
    "updated": "-updated_at",
    "-updated": "updated_at",
    "created": "-created_at",
    "-created": "created_at",
    "deadline": "deadline",
    "-deadline": "-deadline",
    "title": "job_title",
    "-title": "-job_title",
    "company": "company__name",
    "-company": "-company__name",
    "status": "status_rank",
    "-status": "-status_rank",
}


def owned_applications(user: Any) -> ApplicationQuerySet:
    return Application.objects.filter(owner=user)


def get_active_application(request: Request, pk: Any) -> Application:
    """Returns an application owned by the requester, or 404 (also for other users' records)."""
    return get_object_or_404(owned_applications(request.user).active(), pk=pk)


UUID_PATTERN = "[0-9a-fA-F-]{36}"


class ApplicationViewSet(viewsets.ModelViewSet[Application]):
    http_method_names = ["get", "post", "patch", "delete"]
    lookup_value_regex = UUID_PATTERN

    def get_queryset(self) -> QuerySet[Application]:
        qs: ApplicationQuerySet = owned_applications(self.request.user).select_related("company")
        if self.action in {"restore"} or self.request.query_params.get("trash") == "1":
            qs = qs.trashed()
        else:
            qs = qs.active()
        return with_record_flags(qs)

    def get_serializer_class(self) -> type[serializers.BaseSerializer[Application]]:
        if self.action == "list":
            return ApplicationListSerializer
        if self.action in {"create", "partial_update"}:
            return ApplicationWriteSerializer
        return ApplicationDetailSerializer

    def filter_queryset(self, queryset: QuerySet[Application]) -> QuerySet[Application]:  # type: ignore[override]
        if self.action != "list":
            return queryset
        params = self.request.query_params
        if statuses := [s for s in params.get("status", "").split(",") if s in STATUS_ORDER]:
            queryset = queryset.filter(status__in=statuses)
        if company := params.get("company"):
            queryset = queryset.filter(company_id=company)
        if q := params.get("q", "").strip():
            queryset = queryset.filter(Q(job_title__icontains=q) | Q(company__name__icontains=q))
        for field in ("work_arrangement", "employment_type"):
            if value := params.get(field):
                queryset = queryset.filter(**{field: value})
        if after := params.get("deadline_after"):
            queryset = queryset.filter(deadline__gte=after)
        if before := params.get("deadline_before"):
            queryset = queryset.filter(deadline__lte=before)
        ordering = ORDERING.get(params.get("ordering", "updated"), "-updated_at")
        if "status_rank" in ordering:
            queryset = queryset.annotate(status_rank=status_rank())
        return queryset.order_by(ordering, "-updated_at")

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, description="Comma-separated statuses"),
            OpenApiParameter("q", str, description="Search job title or company"),
            OpenApiParameter("company", OpenApiTypes.UUID),
            OpenApiParameter("ordering", str, enum=list(ORDERING)),
            OpenApiParameter("deadline_after", OpenApiTypes.DATE),
            OpenApiParameter("deadline_before", OpenApiTypes.DATE),
            OpenApiParameter("trash", str, enum=["1"], description="List deleted applications"),
        ]
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def _detail(self, pk: Any, status_code: int = status.HTTP_200_OK) -> Response:
        instance = (
            with_record_flags(owned_applications(self.request.user))
            .select_related("company")
            .get(pk=pk)
        )
        return Response(ApplicationDetailSerializer(instance).data, status=status_code)

    @extend_schema(request=ApplicationWriteSerializer, responses={201: ApplicationDetailSerializer})
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = ApplicationWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        assert isinstance(user, User)
        application = services.create_application(user, **serializer.validated_data)
        return self._detail(application.pk, status.HTTP_201_CREATED)

    @extend_schema(request=ApplicationWriteSerializer, responses={200: ApplicationDetailSerializer})
    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        instance = self.get_object()
        serializer = ApplicationWriteSerializer(
            instance, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self._detail(instance.pk)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        services.soft_delete(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={200: ApplicationDetailSerializer})
    @action(detail=True, methods=["post"])
    def restore(self, request: Request, pk: Any = None) -> Response:
        application = self.get_object()
        cutoff = timezone.now() - timedelta(days=settings.SOFT_DELETE_RETENTION_DAYS)
        if application.deleted_at is not None and application.deleted_at < cutoff:
            raise Conflict("This application can no longer be restored.", code="restore_expired")
        services.restore(application)
        return self._detail(application.pk)

    @extend_schema(request=StatusChangeSerializer, responses={200: StatusChangeResponseSerializer})
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request: Request, pk: Any = None) -> Response:
        application = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        assert isinstance(user, User)
        result = services.change_status(
            application,
            serializer.validated_data["status"],
            user=user,
            note=serializer.validated_data["note"],
        )
        instance = (
            with_record_flags(owned_applications(user))
            .select_related("company")
            .get(pk=application.pk)
        )
        return Response(
            {"application": ApplicationDetailSerializer(instance).data, "warnings": result.warnings}
        )


class _ApplicationChildViewSet(viewsets.GenericViewSet[Any]):
    """Base for records nested under /applications/:id/…, scoped through the parent."""

    def get_application(self) -> Application:
        if not hasattr(self, "_application"):
            self._application = get_active_application(self.request, self.kwargs["application_pk"])
        return self._application


class ActivityViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    _ApplicationChildViewSet,
):
    serializer_class = ActivitySerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self) -> QuerySet[ApplicationActivity]:
        return ApplicationActivity.objects.filter(application=self.get_application())

    def perform_create(self, serializer: Any) -> None:
        activity = serializer.save(application=self.get_application(), is_system_generated=False)
        Application.objects.filter(pk=activity.application_id).update(updated_at=timezone.now())

    def _ensure_editable(self, activity: ApplicationActivity) -> None:
        if activity.is_system_generated or activity.type not in MANUAL_ACTIVITY_TYPES:
            raise Conflict("System timeline entries cannot be changed.", code="immutable_record")

    def perform_update(self, serializer: Any) -> None:
        self._ensure_editable(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance: ApplicationActivity) -> None:
        self._ensure_editable(instance)
        instance.delete()


class QuestionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    _ApplicationChildViewSet,
):
    serializer_class = QuestionSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self) -> QuerySet[ApplicationQuestion]:
        return ApplicationQuestion.objects.filter(application=self.get_application())

    def perform_create(self, serializer: Any) -> None:
        application = self.get_application()
        order = serializer.validated_data.get("order")
        if order is None:
            order = application.questions.count()
        serializer.save(application=application, order=order)


class DashboardSummaryView(APIView):
    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request: Request) -> Response:
        from apps.reminders.models import Reminder, ReminderStatus, ReminderType
        from apps.reminders.serializers import ReminderSerializer

        user = request.user
        assert isinstance(user, User)
        apps = owned_applications(user).active()
        counts = apps.aggregate(
            total=Count("id"),
            in_progress=Count("id", filter=Q(status__in=IN_PROGRESS)),
            interviews=Count("id", filter=Q(status=Status.INTERVIEW)),
            offers=Count("id", filter=Q(status=Status.OFFER)),
            rejections=Count("id", filter=Q(status=Status.REJECTED)),
        )
        now = timezone.now()
        open_reminders = Reminder.objects.filter(
            owner=user,
            application__deleted_at__isnull=True,
            status__in=[ReminderStatus.PENDING, ReminderStatus.SENT],
        )
        counts["follow_ups_due"] = open_reminders.filter(
            type=ReminderType.FOLLOW_UP, remind_at__lte=now + timedelta(days=7)
        ).count()
        by_status = dict(
            apps.values_list("status").annotate(n=Count("id")).values_list("status", "n")
        )

        recent = with_record_flags(apps.select_related("company")).order_by("-updated_at")[:5]
        upcoming = (
            open_reminders.filter(status=ReminderStatus.PENDING, remind_at__gte=now)
            .select_related("application__company")
            .order_by("remind_at")[:5]
        )

        tz = zoneinfo.ZoneInfo(user.timezone)
        today = now.astimezone(tz).date()
        start = today - timedelta(days=13)
        per_day = dict(
            ApplicationActivity.objects.filter(
                application__owner=user,
                application__deleted_at__isnull=True,
                occurred_at__date__gte=start - timedelta(days=1),
            )
            .annotate(day=TruncDate("occurred_at", tzinfo=tz))
            .values("day")
            .annotate(n=Count("id"))
            .values_list("day", "n")
        )
        activity = [
            {
                "date": (start + timedelta(days=i)).isoformat(),
                "count": per_day.get(start + timedelta(days=i), 0),
            }
            for i in range(14)
        ]
        return Response(
            {
                "counts": counts,
                "by_status": {s: by_status.get(s, 0) for s in STATUS_ORDER},
                "recent": ApplicationListSerializer(recent, many=True).data,
                "upcoming_reminders": ReminderSerializer(upcoming, many=True).data,
                "activity": activity,
            }
        )


class MetaView(APIView):
    """Reference data for the client: statuses in order and choice labels."""

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request: Request) -> Response:
        from apps.documents.models import IMAGE_ALLOWED_TYPES, DocumentType
        from apps.reminders.models import ReminderType

        def choices(enum: Any) -> list[dict[str, str]]:
            return [{"value": c.value, "label": c.label} for c in enum]

        return Response(
            {
                "statuses": choices(Status),
                "employment_types": choices(EmploymentType),
                "work_arrangements": choices(WorkArrangement),
                "document_types": choices(DocumentType),
                "image_document_types": sorted(IMAGE_ALLOWED_TYPES),
                "reminder_types": choices(ReminderType),
                "activity_types": choices(ActivityType),
                "manual_activity_types": sorted(MANUAL_ACTIVITY_TYPES),
                "max_upload_bytes": settings.MAX_UPLOAD_BYTES,
                "ai_daily_limit": settings.AI_DAILY_LIMIT,
            }
        )
