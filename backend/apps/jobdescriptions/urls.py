from django.urls import path

from . import views

prefix = "applications/<uuid:application_pk>/job-description"

urlpatterns = [
    path(prefix, views.JobDescriptionView.as_view(), name="job-description"),
    path(f"{prefix}/paste", views.PasteView.as_view(), name="job-description-paste"),
    path(f"{prefix}/upload", views.UploadView.as_view(), name="job-description-upload"),
    path(f"{prefix}/text", views.SupplementTextView.as_view(), name="job-description-text"),
    path(f"{prefix}/file", views.FileDownloadView.as_view(), name="job-description-file"),
    path(f"{prefix}/extract", views.ExtractView.as_view(), name="job-description-extract"),
    path(f"{prefix}/review", views.ReviewView.as_view(), name="job-description-review"),
]
