"""Creates a demo account with realistic applications. Safe to run repeatedly."""

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.accounts.models import User
from apps.common.demo_data import build_demo_account


class Command(BaseCommand):
    help = "Create the demo user and sample applications."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--reset", action="store_true", help="Delete and recreate the demo user."
        )

    def handle(self, *args: Any, **options: Any) -> None:
        email = settings.DEMO_USER_EMAIL
        password = settings.DEMO_USER_PASSWORD
        if not password:
            raise CommandError("Set DEMO_USER_PASSWORD to seed the demo account.")
        existing = User.objects.filter(email=email).first()
        if existing and not options["reset"]:
            self.stdout.write(
                f"Demo user {email} already exists; skipping (use --reset to rebuild)."
            )
            return
        with transaction.atomic():
            if existing:
                from apps.accounts.deletion import delete_user_data

                delete_user_data(existing.pk)
            user = build_demo_account(email, password)
        self.stdout.write(self.style.SUCCESS(f"Seeded demo user {user.email}."))
