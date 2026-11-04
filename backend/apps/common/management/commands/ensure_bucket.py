import time

from django.core.management.base import BaseCommand, CommandError

from apps.common.storage import get_storage


class Command(BaseCommand):
    help = "Create the private storage bucket if it does not exist."

    def handle(self, *args: object, **options: object) -> None:
        last_error: Exception | None = None
        for _ in range(30):
            try:
                get_storage().ensure_bucket()
            except Exception as exc:  # storage may still be starting
                last_error = exc
                time.sleep(1)
            else:
                self.stdout.write("Storage bucket ready.")
                return
        raise CommandError(f"Storage is not reachable: {last_error}")
