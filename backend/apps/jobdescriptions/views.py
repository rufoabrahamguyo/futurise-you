from typing import Any

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.models import Application
from apps.applications.views import get_active_application
from apps.common.files import read_upload, validate_file
from apps.common.throttles import ScopedThrottle
from apps.documents.serializers import DownloadSerializer
from apps.documents.views import presigned_download

from . import services
from .models import JobDescription
from .serializers import JobDescriptionSerializer, PasteSerializer, UploadSerializer


def get_job_description(application: Application) -> JobDescription:
    return get_object_or_404(JobDescription.objects.filter(application=application))


class JobDescriptionView(APIView):
    @extend_schema(responses={200: JobDescriptionSerializer})
    def get(self, request: Request, application_pk: Any) -> Response:
        jd = get_job_description(get_active_application(request, application_pk))
        return Response(JobDescriptionSerializer(jd).data)


class PasteView(APIView):
    @extend_schema(request=PasteSerializer, responses={201: JobDescriptionSerializer})
    def post(self, request: Request, application_pk: Any) -> Response:
        application = get_active_application(request, application_pk)
        serializer = PasteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        jd = services.save_pasted(application, serializer.validated_data["text"])
        return Response(JobDescriptionSerializer(jd).data, status=status.HTTP_201_CREATED)


class UploadView(APIView):
    parser_classes = [MultiPartParser]
    throttle_classes = [ScopedThrottle]
    throttle_scope = "upload"

    @extend_schema(
        request={"multipart/form-data": UploadSerializer}, responses={201: JobDescriptionSerializer}
    )
    def post(self, request: Request, application_pk: Any) -> Response:
        application = get_active_application(request, application_pk)
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]
        file = validate_file(read_upload(upload), upload.name or "", allow_images=False)
        jd = services.save_uploaded(application, file)
        return Response(JobDescriptionSerializer(jd).data, status=status.HTTP_201_CREATED)


class SupplementTextView(APIView):
    """For uploads with no extractable text (e.g. scanned PDFs): paste the text once."""

    @extend_schema(request=PasteSerializer, responses={200: JobDescriptionSerializer})
    def post(self, request: Request, application_pk: Any) -> Response:
        jd = get_job_description(get_active_application(request, application_pk))
        serializer = PasteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        jd = services.supplement_text(jd, serializer.validated_data["text"])
        return Response(JobDescriptionSerializer(jd).data)


class FileDownloadView(APIView):
    @extend_schema(
        parameters=[OpenApiParameter("inline", str, enum=["1"])],
        responses={200: DownloadSerializer},
    )
    def get(self, request: Request, application_pk: Any) -> Response:
        jd = get_job_description(get_active_application(request, application_pk))
        if not jd.has_file:
            return Response(
                {"error": {"code": "not_found", "message": "No file was uploaded.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return presigned_download(
            key=jd.original_file_key,
            filename=jd.original_filename,
            mime_type=jd.original_file_mime,
            inline=request.query_params.get("inline") == "1",
        )
