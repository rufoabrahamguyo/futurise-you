from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("interview-preps", views.InterviewPrepViewSet, basename="interview-prep")

urlpatterns = [
    path(
        "applications/<uuid:application_pk>/interview-prep",
        views.ApplicationPrepView.as_view(),
        name="interview-prep",
    ),
    path("ai/usage", views.UsageView.as_view(), name="ai-usage"),
    *router.urls,
]
