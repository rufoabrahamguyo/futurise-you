"""Strict schemas for model output. Anything else is rejected."""

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Quoted(_Strict):
    value: str = Field(min_length=1, max_length=500)
    quote: str = Field(min_length=1, max_length=2000)


SCALAR_FIELDS = (
    "job_title",
    "company",
    "location",
    "employment_type",
    "work_arrangement",
    "compensation",
    "deadline",
)
LIST_FIELDS = (
    "required_skills",
    "education",
    "experience",
    "responsibilities",
    "mandatory_requirements",
    "preferred_qualifications",
    "eligibility_criteria",
    "benefits",
    "required_documents",
    "application_instructions",
)


class ExtractionOutput(_Strict):
    job_title: Quoted | None
    company: Quoted | None
    location: Quoted | None
    employment_type: Quoted | None
    work_arrangement: Quoted | None
    compensation: Quoted | None
    deadline: Quoted | None
    required_skills: list[Quoted] = Field(max_length=40)
    education: list[Quoted] = Field(max_length=20)
    experience: list[Quoted] = Field(max_length=20)
    responsibilities: list[Quoted] = Field(max_length=40)
    mandatory_requirements: list[Quoted] = Field(max_length=40)
    preferred_qualifications: list[Quoted] = Field(max_length=40)
    eligibility_criteria: list[Quoted] = Field(max_length=20)
    benefits: list[Quoted] = Field(max_length=40)
    required_documents: list[Quoted] = Field(max_length=20)
    application_instructions: list[Quoted] = Field(max_length=20)


class TechnicalQuestion(_Strict):
    question: str = Field(min_length=5, max_length=600)
    why_asked: str = Field(min_length=1, max_length=600)
    answer_outline: list[str] = Field(max_length=8)


class BehavioralQuestion(_Strict):
    question: str = Field(min_length=5, max_length=600)
    why_asked: str = Field(min_length=1, max_length=600)
    star_hint: str = Field(min_length=1, max_length=600)


class CVQuestion(_Strict):
    question: str = Field(min_length=5, max_length=600)
    cv_evidence: str = Field(min_length=1, max_length=600)


class RoleQuestion(_Strict):
    question: str = Field(min_length=5, max_length=600)
    why_asked: str = Field(min_length=1, max_length=600)


class InterviewPrepOutput(_Strict):
    technical_questions: list[TechnicalQuestion] = Field(min_length=1, max_length=12)
    behavioral_questions: list[BehavioralQuestion] = Field(min_length=1, max_length=12)
    cv_questions: list[CVQuestion] = Field(max_length=12)
    role_questions: list[RoleQuestion] = Field(min_length=1, max_length=12)
    preparation_topics: list[str] = Field(min_length=1, max_length=15)
