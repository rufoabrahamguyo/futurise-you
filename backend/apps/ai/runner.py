"""Calls the provider and validates its output against a strict schema."""

import json
from dataclasses import dataclass

import structlog
from pydantic import BaseModel, ValidationError

from .providers import LLMProvider

log = structlog.get_logger(__name__)

RETRY_INSTRUCTION = (
    "\n\nYour previous reply was not valid. Reply again with only one JSON object that matches the "
    "schema exactly: no prose, no code fences, no extra keys."
)


class InvalidModelOutput(Exception):
    """The model's output did not match the schema twice in a row."""


@dataclass
class StructuredResult[M: BaseModel]:
    data: M
    model: str
    retried: bool


def _parse[M: BaseModel](text: str, schema: type[M]) -> M:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").removeprefix("json").strip()
    return schema.model_validate(json.loads(cleaned))


def run_structured[M: BaseModel](
    provider: LLMProvider, system: str, user: str, schema: type[M], *, task: str
) -> StructuredResult[M]:
    """Validates output strictly; retries once with a stricter instruction, then fails cleanly."""
    completion = provider.complete(system, user, task=task)
    try:
        return StructuredResult(_parse(completion.text, schema), completion.model, retried=False)
    except (json.JSONDecodeError, ValidationError) as exc:
        log.warning("llm_output_invalid", task=task, attempt=1, error=type(exc).__name__)
    completion = provider.complete(system, user + RETRY_INSTRUCTION, task=task)
    try:
        return StructuredResult(_parse(completion.text, schema), completion.model, retried=True)
    except (json.JSONDecodeError, ValidationError) as exc:
        log.warning("llm_output_invalid", task=task, attempt=2, error=type(exc).__name__)
        raise InvalidModelOutput(type(exc).__name__) from exc
