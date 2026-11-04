from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, OuterRef, Prefetch, QuerySet, Subquery
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.views import UUID_PATTERN, get_active_application
from apps.common.auth import request_user
from apps.common.files import IMAGE_TYPES, read_upload, validate_file
from apps.common.storage import get_storage
from apps.common.throttles import ScopedThrottle

from . import services
from .models import (
    IMAGE_ALLOWED_TYPES,
    ApplicationDocument,
    Document,
    DocumentType,
    DocumentVersion,
)
from .serializers import (
    ApplicationDocumentSerializer,
    AttachSerializer,
    AttachUploadSerializer,
    DocumentCreateSerializer,
    DocumentDetailSerializer,
    DocumentSerializer,
    DownloadSerializer,
    RoleSerializer,
    VersionCreateSerializer,
    VersionSerializer,
)


def _validated_upload(upload: Any, doc_type: str) -> Any:
    data = read_upload(upload)
    return validate_file(data, upload.name or "", allow_images=doc_type in IMAGE_ALLOWED_TYPES)


def presigned_download(*, key: str, filename: str, mime_type: str, inline: bool) -> Response:
    inline = inline and (mime_type == "application/pdf" or mime_type in IMAGE_TYPES)
    url = get_storage().presigned_get(key, filename=filename, content_type=mime_type, inline=inline)
    return Response(
        {
            "url": url,
            "expires_in": settings.PRESIGNED_URL_TTL_SECONDS,
            "filename": filename,
            "mime_type": mime_type,
        }
    )


class DocumentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet[Document],
):
    http_method_names = ["get", "post", "patch", "delete"]
    lookup_value_regex = UUID_PATTERN

    def get_queryset(self) -> QuerySet[Document]:
        qs = Document.objects.filter(owner=request_user(self.request)).annotate(
            version_count=Count("versions", distinct=True),
            application_count=Count(
                "versions__application_links__application",
                filter=None,
                distinct=True,
            ),
        )
        return qs.prefetch_related(
            Prefetch(
                "versions",
                queryset=DocumentVersion.objects.order_by("-version_number"),
                to_attr="prefetched_versions",
            )
        )

    def filter_queryset(self, queryset: QuerySet[Document]) -> QuerySet[Document]:  # type: ignore[override]
        if self.action != "list":
            return queryset
        params = self.request.query_params
        queryset = (
            queryset.filter(archived_at__isnull=False)
            if params.get("archived") == "1"
            else queryset.filter(archived_at__isnull=True)
        )
        if doc_type := params.get("type"):
            queryset = queryset.filter(type=doc_type)
        if params.get("include_non_master") != "1":
            queryset = queryset.filter(is_master=True)
        return queryset.order_by("type", "title")

    def get_serializer_class(self) -> type[serializers.BaseSerializer[Any]]:
        return DocumentDetailSerializer if self.action == "retrieve" else DocumentSerializer

    def get_throttles(self) -> list[Any]:
        if self.action in {"create", "versions"} and self.request.method == "POST":
            self.throttle_scope = "upload"
            return [ScopedThrottle()]
        return super().get_throttles()

    @extend_schema(
        parameters=[
            OpenApiParameter("type", str, enum=[c.value for c in DocumentType]),
            OpenApiParameter("archived", str, enum=["1"]),
            OpenApiParameter("include_non_master", str, enum=["1"]),
        ]
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request={"multipart/form-data": DocumentCreateSerializer},
        responses={201: DocumentDetailSerializer},
    )
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = DocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        file = _validated_upload(data["file"], data["type"])
        version = services.create_document(
            request_user(request), title=data["title"], type=data["type"], file=file
        )
        document = self.get_queryset().get(pk=version.document_id)
        return Response(DocumentDetailSerializer(document).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer: Any) -> None:
        serializer.save()

    @extend_schema(responses={204: None})
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Archives the document. Versions used by applications stay available there."""
        services.archive(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        methods=["POST"],
        request={"multipart/form-data": VersionCreateSerializer},
        responses={201: VersionSerializer},
    )
    @extend_schema(methods=["GET"], responses={200: VersionSerializer(many=True)})
    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser])
    def versions(self, request: Request, pk: Any = None) -> Response:
        document = self.get_object()
        if request.method == "GET":
            return Response(
                VersionSerializer(document.versions.order_by("-version_number"), many=True).data
            )
        if document.archived_at is not None:
            raise serializers.ValidationError(
                {"file": ["Archived documents can't get new versions."]}
            )
        serializer = VersionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version = services.add_version(
            document, _validated_upload(serializer.validated_data["file"], document.type)
        )
        return Response(VersionSerializer(version).data, status=status.HTTP_201_CREATED)


class VersionDownloadView(APIView):
    """Authorized download: returns a presigned URL valid for at most five minutes."""

    @extend_schema(
        parameters=[
            OpenApiParameter("inline", str, enum=["1"], description="Preview in the browser")
        ],
        responses={200: DownloadSerializer},
    )
    def get(self, request: Request, version_id: Any) -> Response:
        version = get_object_or_404(
            DocumentVersion.objects.filter(document__owner=request_user(request)), pk=version_id
        )
        return presigned_download(
            key=version.storage_key,
            filename=version.original_filename,
            mime_type=version.mime_type,
            inline=request.query_params.get("inline") == "1",
        )


class ApplicationDocumentViewSet(viewsets.GenericViewSet[ApplicationDocument]):
    serializer_class = ApplicationDocumentSerializer
    pagination_class = None
    lookup_value_regex = UUID_PATTERN

    def get_application(self) -> Any:
        return get_active_application(self.request, self.kwargs["application_pk"])

    def get_queryset(self) -> QuerySet[ApplicationDocument]:
        latest = (
            DocumentVersion.objects.filter(document=OuterRef("document_version__document"))
            .order_by("-version_number")
            .values("version_number")[:1]
        )
        return (
            ApplicationDocument.objects.filter(application=self.get_application())
            .select_related("document_version__document")
            .annotate(latest_version_number=Subquery(latest))
            .order_by("added_after_submission", "role", "created_at")
        )

    def get_throttles(self) -> list[Any]:
        if self.action == "upload":
            self.throttle_scope = "upload"
            return [ScopedThrottle()]
        return super().get_throttles()

    def _respond(
        self, link: ApplicationDocument, status_code: int = status.HTTP_200_OK
    ) -> Response:
        return Response(
            ApplicationDocumentSerializer(self.get_queryset().get(pk=link.pk)).data,
            status=status_code,
        )

    @extend_schema(responses={200: ApplicationDocumentSerializer(many=True)})
    def list(self, request: Request, application_pk: Any = None) -> Response:
        return Response(ApplicationDocumentSerializer(self.get_queryset(), many=True).data)

    @extend_schema(request=AttachSerializer, responses={201: ApplicationDocumentSerializer})
    def create(self, request: Request, application_pk: Any = None) -> Response:
        application = self.get_application()
        serializer = AttachSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                link = services.attach_version(
                    application,
                    serializer.validated_data["document_version_id"],
                    serializer.validated_data["role"],
                )
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"document_version_id": ["This version is already attached."]}
            ) from exc
        return self._respond(link, status.HTTP_201_CREATED)

    @extend_schema(
        request={"multipart/form-data": AttachUploadSerializer},
        responses={201: ApplicationDocumentSerializer},
    )
    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def upload(self, request: Request, application_pk: Any = None) -> Response:
        """Uploads a file and attaches it. Optionally keeps it in the library as well."""
        application = self.get_application()
        serializer = AttachUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        file = _validated_upload(data["file"], data["role"])
        title = data.get("title") or file.filename.rsplit(".", 1)[0]
        with transaction.atomic():
            version = services.create_document(
                request_user(request),
                title=title,
                type=data["role"],
                file=file,
                is_master=data["save_to_library"],
            )
            link = services.attach_version(application, version, data["role"])
        return self._respond(link, status.HTTP_201_CREATED)

    @extend_schema(request=RoleSerializer, responses={200: ApplicationDocumentSerializer})
    def partial_update(
        self, request: Request, application_pk: Any = None, pk: Any = None
    ) -> Response:
        link = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = RoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        link.role = serializer.validated_data["role"]
        link.save(update_fields=["role", "updated_at"])  # frozen rows raise → 409
        return self._respond(link)

    @extend_schema(responses={204: None})
    def destroy(self, request: Request, application_pk: Any = None, pk: Any = None) -> Response:
        services.detach(get_object_or_404(self.get_queryset(), pk=pk))  # frozen rows raise → 409
        return Response(status=status.HTTP_204_NO_CONTENT)
