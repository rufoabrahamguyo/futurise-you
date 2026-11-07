from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=False)
router.register("exports", views.ExportViewSet, basename="export")

urlpatterns = router.urls
