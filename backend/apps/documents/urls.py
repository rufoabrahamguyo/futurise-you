from typing import Any

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("documents", views.DocumentViewSet, basename="document")

_links: dict[str, Any] = {"get": "list", "post": "create"}
_link: dict[str, Any] = {"patch": "partial_update", "delete": "destroy"}

urlpatterns = [
    path(
        "documents/versions/<uuid:version_id>/download",
        views.VersionDownloadView.as_view(),
        name="document-version-download",
    ),
    *router.urls,
    path(
        "applications/<uuid:application_pk>/documents",
        views.ApplicationDocumentViewSet.as_view(_links),
        name="application-documents",
    ),
    path(
        "applications/<uuid:application_pk>/documents/upload",
        views.ApplicationDocumentViewSet.as_view({"post": "upload"}),
        name="application-documents-upload",
    ),
    path(
        "applications/<uuid:application_pk>/documents/<uuid:pk>",
        views.ApplicationDocumentViewSet.as_view(_link),
        name="application-document-detail",
    ),
]
