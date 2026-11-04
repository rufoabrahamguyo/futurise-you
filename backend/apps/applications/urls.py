from typing import Any

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("applications", views.ApplicationViewSet, basename="application")

_list: dict[str, Any] = {"get": "list", "post": "create"}
_detail: dict[str, Any] = {"patch": "partial_update", "delete": "destroy"}

urlpatterns = [
    *router.urls,
    path(
        "applications/<uuid:application_pk>/activities",
        views.ActivityViewSet.as_view(_list),
        name="application-activities",
    ),
    path(
        "applications/<uuid:application_pk>/activities/<uuid:pk>",
        views.ActivityViewSet.as_view(_detail),
        name="application-activity-detail",
    ),
    path(
        "applications/<uuid:application_pk>/questions",
        views.QuestionViewSet.as_view(_list),
        name="application-questions",
    ),
    path(
        "applications/<uuid:application_pk>/questions/<uuid:pk>",
        views.QuestionViewSet.as_view(_detail),
        name="application-question-detail",
    ),
    path("dashboard/summary", views.DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("meta", views.MetaView.as_view(), name="meta"),
]
