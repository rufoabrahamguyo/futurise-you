"""Provider-agnostic LLM interface, configured by environment variables.

`LLM_PROVIDER=fake` (the default, and the fallback when no key is set) uses a
deterministic local provider. `openai_compatible` calls any OpenAI-compatible
Chat Completions endpoint (`LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`).
"""

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import cache

import httpx
import structlog
from django.conf import settings

log = structlog.get_logger(__name__)


class ProviderError(Exception):
    """The provider could not be reached or returned an error."""


@dataclass
class Completion:
    text: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    def complete(self, system: str, user: str, *, task: str) -> Completion:
        """Returns the model's raw text for a system + user prompt."""


class OpenAICompatibleProvider(LLMProvider):
    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def complete(self, system: str, user: str, *, task: str) -> Completion:
        started = time.monotonic()
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            text = data["choices"][0]["message"]["content"] or ""
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            # Only the error type and status are logged; never prompts or responses.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            log.warning("llm_request_failed", task=task, error=type(exc).__name__, status=status)
            raise ProviderError(type(exc).__name__) from exc
        usage = data.get("usage") or {}
        log.info(
            "llm_request",
            task=task,
            model=self.model,
            duration_ms=round((time.monotonic() - started) * 1000),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )
        return Completion(
            text,
            data.get("model", self.model),
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
        )


@cache
def get_provider() -> LLMProvider:
    if settings.LLM_PROVIDER == "openai_compatible" and settings.LLM_API_KEY:
        return OpenAICompatibleProvider(
            settings.LLM_API_BASE,
            settings.LLM_API_KEY,
            settings.LLM_MODEL,
            settings.LLM_TIMEOUT_SECONDS,
        )
    from .fake import FakeProvider

    return FakeProvider()
