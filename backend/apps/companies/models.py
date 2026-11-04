from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from apps.common.models import TimestampedModel

if TYPE_CHECKING:
    from apps.accounts.models import User


class Company(TimestampedModel):
    """A company the user applied to. Private to its owner; never shared."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="companies"
    )
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(Lower("name"), "owner", name="uniq_company_name_per_owner"),
        ]

    def __str__(self) -> str:
        return self.name


def get_or_create_company(owner: "User", name: str) -> Company:
    name = " ".join(name.split())
    existing = Company.objects.filter(owner=owner, name__iexact=name).first()
    if existing is not None:
        return existing
    return Company.objects.create(owner=owner, name=name)
