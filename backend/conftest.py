from collections.abc import Callable, Iterator
from typing import Any

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.common.storage import MemoryStorage, get_storage
from tests.factories import UserFactory


@pytest.fixture(autouse=True)
def _clean_state(settings: Any) -> Iterator[None]:
    from django.core.cache import cache

    cache.clear()
    storage = get_storage()
    assert isinstance(storage, MemoryStorage)
    storage.objects.clear()
    mail.outbox = []
    yield


@pytest.fixture
def storage() -> MemoryStorage:
    store = get_storage()
    assert isinstance(store, MemoryStorage)
    return store


@pytest.fixture
def user(db: None) -> Any:
    return UserFactory()


@pytest.fixture
def other_user(db: None) -> Any:
    return UserFactory()


@pytest.fixture
def anon_client() -> APIClient:
    return APIClient()


@pytest.fixture
def make_client() -> Callable[[Any], APIClient]:
    def _make(user: Any) -> APIClient:
        client = APIClient()
        client.force_login(user)
        return client

    return _make


@pytest.fixture
def client_for(make_client: Callable[[Any], APIClient]) -> Callable[[Any], APIClient]:
    return make_client


@pytest.fixture
def api(user: Any, make_client: Callable[[Any], APIClient]) -> APIClient:
    return make_client(user)


@pytest.fixture
def other_api(other_user: Any, make_client: Callable[[Any], APIClient]) -> APIClient:
    return make_client(other_user)
