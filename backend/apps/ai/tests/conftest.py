import json
from collections.abc import Callable
from typing import Any

import pytest

from apps.ai.providers import Completion, LLMProvider, ProviderError


class ScriptedProvider(LLMProvider):
    """Returns queued responses and records every prompt it receives."""

    name = "scripted"
    model = "scripted-1"

    def __init__(self, responses: list[str | Exception]) -> None:
        self.responses = list(responses)
        self.prompts: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, *, task: str) -> Completion:
        self.prompts.append((system, user))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return Completion(response, self.model)


@pytest.fixture
def use_provider(monkeypatch) -> Callable[[list[Any]], ScriptedProvider]:
    def _use(responses: list[Any]) -> ScriptedProvider:
        provider = ScriptedProvider(
            [r if isinstance(r, str | Exception) else json.dumps(r) for r in responses]
        )
        monkeypatch.setattr("apps.ai.tasks.get_provider", lambda: provider)
        return provider

    return _use


@pytest.fixture
def acknowledged(user):
    from django.utils import timezone

    user.ai_acknowledged_at = timezone.now()
    user.save()
    return user


__all__ = ["ProviderError", "ScriptedProvider"]
