from functools import partial
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.applications.views import UUID_PATTERN
from apps.common.auth import request_user
from apps.common.exceptions import Conflict
from apps.common.throttles import ScopedThrottle
from apps.documents.serializers import DownloadSerializer
from apps.documents.views import presigned_download

from .models import ExportJob


class ExportSerializer(serializers.ModelSerializer[ExportJob]):
    downloadable = serializers.SerializerMethodField()

    class Meta:
        model = ExportJob
        fields = [
            "id",
            "status",
            "size",
            "error",
            "created_at",
            "completed_at",
            "expires_at",
            "downloadable",
        ]
        read_only_fields = fields

    def get_downloadable(self, obj: ExportJob) -> bool:
        return (
            obj.status == "succeeded"
            and obj.expires_at is not None
            and obj.expires_at > timezone.now()
        )


class ExportViewSet(mixins.ListModelMixin, viewsets.GenericViewSet[ExportJob]):
    serializer_class = ExportSerializer
    lookup_value_regex = UUID_PATTERN
    pagination_class = None

    def get_queryset(self) -> QuerySet[ExportJob]:
        return ExportJob.objects.filter(owner=request_user(self.request))[:10]

    def get_throttles(self) -> list[Any]:
        if self.action == "create":
            self.throttle_scope = "export"
            return [ScopedThrottle()]
        return super().get_throttles()

    @extend_schema(request=None, responses={202: ExportSerializer})
    def create(self, request: Request) -> Response:
        from .tasks import build_export_job

        user = request_user(request)
        with transaction.atomic():
            if ExportJob.objects.filter(owner=user, status__in=["queued", "processing"]).exists():
                raise Conflict("An export is already being prepared.", code="export_in_progress")
            job = ExportJob.objects.create(owner=user)
            transaction.on_commit(partial(build_export_job.delay, str(job.pk)))
        return Response(ExportSerializer(job).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(responses={200: DownloadSerializer})
    @action(detail=True, methods=["get"])
    def download(self, request: Request, pk: Any = None) -> Response:
        job = get_object_or_404(ExportJob.objects.filter(owner=request_user(request)), pk=pk)
        if not ExportSerializer().get_downloadable(job):
            raise Conflict("This export has expired or isn't ready yet.", code="export_unavailable")
        stamp = (job.completed_at or job.created_at).strftime("%Y-%m-%d")
        return presigned_download(
            key=job.storage_key,
            filename=f"kazitrail-export-{stamp}.zip",
            mime_type="application/zip",
            inline=False,
        )
