import time

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.utils import OperationalError


class Command(BaseCommand):
    help = "Wait until the database accepts connections."

    def handle(self, *args: object, **options: object) -> None:
        for _ in range(60):
            try:
                connection.ensure_connection()
            except OperationalError:
                time.sleep(1)
            else:
                self.stdout.write("Database ready.")
                return
        raise CommandError("Database did not become available in time.")
