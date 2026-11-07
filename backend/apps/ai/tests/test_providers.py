"""The OpenAI-compatible provider and provider selection."""

import httpx
import pytest

from apps.ai.fake import FakeProvider
from apps.ai.providers import OpenAICompatibleProvider, ProviderError, get_provider


def test_openai_compatible_request_and_response(monkeypatch) -> None:
    captured = {}

    def fake_post(url, *, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={
                "model": "gpt-x",
                "choices": [{"message": {"content": '{"ok": true}'}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3},
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleProvider("https://llm.example.com/v1/", "sk-test", "gpt-x", 30)
    completion = provider.complete("system", "user", task="extraction")
    assert completion.text == '{"ok": true}'
    assert (completion.model, completion.input_tokens, completion.output_tokens) == ("gpt-x", 12, 3)
    assert captured["url"] == "https://llm.example.com/v1/chat/completions"
    assert captured["headers"] == {"Authorization": "Bearer sk-test"}
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in captured["json"]["messages"]] == ["system", "user"]


@pytest.mark.parametrize("failure", ["status", "network", "shape"])
def test_openai_compatible_errors_become_provider_errors(monkeypatch, failure) -> None:
    def fake_post(url, **kwargs):
        request = httpx.Request("POST", url)
        if failure == "network":
            raise httpx.ConnectTimeout("timeout", request=request)
        if failure == "status":
            return httpx.Response(503, request=request, json={})
        return httpx.Response(200, request=request, json={"choices": []})

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(ProviderError):
        OpenAICompatibleProvider("https://llm.example.com/v1", "k", "m", 5).complete(
            "s", "u", task="extraction"
        )


def test_provider_selection(settings) -> None:
    get_provider.cache_clear()
    try:
        settings.LLM_PROVIDER = "openai_compatible"
        settings.LLM_API_KEY = ""
        assert isinstance(get_provider(), FakeProvider)  # no key → fake
        get_provider.cache_clear()
        settings.LLM_API_KEY = "sk-real"
        assert isinstance(get_provider(), OpenAICompatibleProvider)
    finally:
        get_provider.cache_clear()
