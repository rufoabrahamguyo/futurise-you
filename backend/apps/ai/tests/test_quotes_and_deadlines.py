"""FR-05: quotes are verified on the server; deadlines are never inferred."""

from datetime import date

import pytest

from apps.ai.deadlines import parse_deadline
from apps.ai.quotes import verify
from apps.ai.safety import scrub_contact_details
from apps.ai.schemas import ExtractionOutput

SOURCE = "Senior Engineer\nLocation:   London,\n  UK\nRequirements\n- 5+ years of Python"


def output(**overrides) -> ExtractionOutput:
    base = {
        field: None
        for field in (
            "job_title",
            "company",
            "location",
            "employment_type",
            "work_arrangement",
            "compensation",
            "deadline",
        )
    }
    base.update({field: [] for field in ExtractionOutput.model_fields if field not in base})
    base.update(overrides)
    return ExtractionOutput.model_validate(base)


def test_quotes_match_after_whitespace_normalisation() -> None:
    verified, discarded = verify(
        output(location={"value": "London, UK", "quote": "Location: London, UK"}), SOURCE
    )
    assert verified["location"] == {"value": "London, UK", "quote": "Location: London, UK"}
    assert discarded == []


def test_unsupported_values_are_discarded_and_become_null() -> None:
    verified, discarded = verify(
        output(
            job_title={"value": "Staff Engineer", "quote": "Staff Engineer"},
            compensation={"value": "£100k", "quote": "Salary: £100k"},
            required_skills=[
                {"value": "Python", "quote": "Python"},
                {"value": "Rust", "quote": "Rust experience"},
            ],
        ),
        SOURCE,
    )
    assert verified["job_title"] is None
    assert verified["compensation"] is None
    assert [s["value"] for s in verified["required_skills"]] == ["Python"]
    assert {d["field"] for d in discarded} == {"job_title", "compensation", "required_skills"}


def test_schema_rejects_extra_keys_and_bad_shapes() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        output(job_title={"value": "x", "quote": "x", "confidence": 0.9})
    with pytest.raises(ValidationError):
        ExtractionOutput.model_validate({"job_title": "Engineer"})


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Applications close on 28 February 2026.", date(2026, 2, 28)),
        ("Deadline: 2026-03-15", date(2026, 3, 15)),
        ("Apply by March 15, 2026", date(2026, 3, 15)),
        ("Closing date: 1st Apr 2026", date(2026, 4, 1)),
        ("Apply by 15 March", None),  # no year
        ("Closing date: 03/04/2026", None),  # ambiguous day/month
        ("Applications close in two weeks", None),
        ("Apply by Friday", None),
        ("Close on 1 May 2026 or 3 May 2026", None),  # two different dates
        ("Deadline: 31 February 2026", None),  # impossible date
        (None, None),
    ],
)
def test_parse_deadline(text, expected) -> None:
    assert parse_deadline(text) == expected


def test_contact_details_are_removed_from_cv_text() -> None:
    cv = "Ada Lovelace\nada.lovelace@example.com | +44 (0)20 7946 0958 | 07700 900123\nPython since 2015, 5+ years"
    scrubbed = scrub_contact_details(cv)
    assert "example.com" not in scrubbed
    assert "7946" not in scrubbed and "900123" not in scrubbed
    assert "[email removed]" in scrubbed and "[phone removed]" in scrubbed
    assert "Python since 2015, 5+ years" in scrubbed
