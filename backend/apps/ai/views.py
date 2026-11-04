from typing import Any

from django.conf import settings
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.views import UUID_PATTERN, get_active_application
from apps.common.auth import request_user
from apps.common.throttles import ScopedThrottle

from . import services
from .models import InterviewPreparation
from .serializers import AIUsageSerializer, InterviewPreparationSerializer
from .usage import used_today


class ApplicationPrepView(APIView):
    def get_throttles(self) -> list[Any]:
        if self.request.method == "POST":
            self.throttle_scope = "ai"
            return [ScopedThrottle()]
        return super().get_throttles()

    @extend_schema(responses={200: InterviewPreparationSerializer(many=True)})
    def get(self, request: Request, application_pk: Any) -> Response:
        application = get_active_application(request, application_pk)
        preps = InterviewPreparation.objects.filter(application=application)
        return Response(InterviewPreparationSerializer(preps, many=True).data)

    @extend_schema(request=None, responses={202: InterviewPreparationSerializer})
    def post(self, request: Request, application_pk: Any) -> Response:
        application = get_active_application(request, application_pk)
        prep = services.queue_interview_prep(application, request_user(request))
        return Response(InterviewPreparationSerializer(prep).data, status=status.HTTP_202_ACCEPTED)


class InterviewPrepViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet[InterviewPreparation],
):
    serializer_class = InterviewPreparationSerializer
    http_method_names = ["get", "patch", "post"]
    lookup_value_regex = UUID_PATTERN

    def get_queryset(self) -> QuerySet[InterviewPreparation]:
        return InterviewPreparation.objects.filter(
            application__owner=request_user(self.request), application__deleted_at__isnull=True
        )

    def get_throttles(self) -> list[Any]:
        if self.action == "retry":
            self.throttle_scope = "ai"
            return [ScopedThrottle()]
        return super().get_throttles()

    @extend_schema(request=None, responses={202: InterviewPreparationSerializer})
    @action(detail=True, methods=["post"])
    def retry(self, request: Request, pk: Any = None) -> Response:
        prep = services.retry_interview_prep(
            get_object_or_404(self.get_queryset(), pk=pk), request_user(request)
        )
        return Response(InterviewPreparationSerializer(prep).data, status=status.HTTP_202_ACCEPTED)


class UsageView(APIView):
    @extend_schema(responses={200: AIUsageSerializer})
    def get(self, request: Request) -> Response:
        return Response(
            {
                "used_today": used_today(request_user(request)),
                "daily_limit": settings.AI_DAILY_LIMIT,
            }
        )
