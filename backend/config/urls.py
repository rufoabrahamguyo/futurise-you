from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common.views import HealthView

api_v1: list[URLPattern | URLResolver] = [
    path("health", HealthView.as_view(), name="health"),
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.applications.urls")),
    path("", include("apps.reminders.urls")),
    path("", include("apps.documents.urls")),
    path("", include("apps.jobdescriptions.urls")),
    path("", include("apps.ai.urls")),
    path("", include("apps.exports.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="api-docs"),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
    path("admin/", admin.site.urls),
]
