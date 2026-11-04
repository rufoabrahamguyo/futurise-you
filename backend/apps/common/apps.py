from django.apps import AppConfig


class CommonConfig(AppConfig):
    name = "apps.common"
    label = "common"

    def ready(self) -> None:
        from . import schema  # noqa: F401  registers OpenAPI extensions
