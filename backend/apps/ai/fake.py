"""Deterministic local provider for tests and for running without an API key.

It reads the same prompt a real model would receive and answers with JSON
built by simple rules. Every value it returns quotes the job description
verbatim, so its output passes the same server-side checks as a real model's.
It never follows instructions found inside the delimited content.
"""

import json
import re
from typing import Any

from .prompts import unwrap
from .providers import Completion, LLMProvider

SECTION_HEADINGS: dict[str, tuple[str, ...]] = {
    "responsibilities": (
        "responsibilities",
        "what you'll do",
        "what you will do",
        "the role",
        "key duties",
        "duties",
    ),
    "mandatory_requirements": (
        "requirements",
        "essential",
        "must have",
        "what you'll need",
        "what we're looking for",
        "you have",
    ),
    "preferred_qualifications": ("nice to have", "preferred", "desirable", "bonus", "nice-to-have"),
    "benefits": ("benefits", "perks", "what we offer", "why join"),
    "application_instructions": ("how to apply", "application process", "to apply"),
    "eligibility_criteria": ("eligibility", "right to work", "who can apply"),
    "education": ("education", "qualifications"),
}
LABELS = {
    "location": ("location",),
    "employment_type": ("employment type", "contract type", "job type"),
    "compensation": ("salary", "compensation", "pay"),
    "company": ("company", "employer", "organisation", "organization"),
}
SKILLS = (
    "Python",
    "Go",
    "Java",
    "TypeScript",
    "JavaScript",
    "React",
    "Django",
    "SQL",
    "PostgreSQL",
    "Kubernetes",
    "Docker",
    "AWS",
    "GCP",
    "Azure",
    "Terraform",
    "Figma",
    "user research",
    "prototyping",
    "design systems",
    "accessibility",
    "WCAG",
    "data analysis",
    "Excel",
    "Tableau",
    "machine learning",
    "CI",
    "Rust",
    "C++",
)
DOCUMENTS = (
    "CV",
    "résumé",
    "resume",
    "cover letter",
    "portfolio",
    "transcript",
    "references",
    "case study",
)
DEADLINE_CUES = re.compile(
    r"\b(applications? (?:close|closes|are due|due)|closing date|deadline\s*:|apply by|closes on)",
    re.IGNORECASE,
)
DATE_PHRASE = re.compile(
    r"(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?(?:\s+\d{4})?|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?(?:\s+\d{4})?|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})"
)
BULLET = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s+")


def _quoted(value: str, quote: str) -> dict[str, str]:
    return {"value": value.strip()[:500], "quote": quote.strip()[:2000]}


def _heading_key(line: str) -> str | None:
    text = line.strip().rstrip(":").lower()
    if len(text) > 40 or BULLET.match(line):
        return None
    for key, cues in SECTION_HEADINGS.items():
        if any(text == cue or text.startswith(cue) for cue in cues):
            return key
    return None


def extract(job_description: str) -> dict[str, Any]:
    lines = [line.rstrip() for line in job_description.splitlines()]
    out: dict[str, Any] = {
        "job_title": None,
        "company": None,
        "location": None,
        "employment_type": None,
        "work_arrangement": None,
        "compensation": None,
        "deadline": None,
        "required_skills": [],
        "education": [],
        "experience": [],
        "responsibilities": [],
        "mandatory_requirements": [],
        "preferred_qualifications": [],
        "eligibility_criteria": [],
        "benefits": [],
        "required_documents": [],
        "application_instructions": [],
    }
    content = [line for line in lines if line.strip()]
    if (
        content
        and len(content[0]) <= 100
        and ":" not in content[0]
        and not _heading_key(content[0])
    ):
        out["job_title"] = _quoted(content[0], content[0])
    if (
        len(content) > 1
        and len(content[1]) <= 60
        and ":" not in content[1]
        and not _heading_key(content[1])
    ):
        out["company"] = _quoted(content[1], content[1])

    section: str | None = None
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        key = _heading_key(stripped)
        if key:
            section = key
            continue
        label_match = re.match(r"^([A-Za-z ]{3,30}):\s*(.+)$", stripped)
        if label_match:
            label, value = label_match.group(1).strip().lower(), label_match.group(2).strip()
            for field, cues in LABELS.items():
                if label in cues and out[field] is None:
                    out[field] = _quoted(value, stripped)
        arrangement = re.search(r"\b(remote|hybrid|on-?site|in office)\b", stripped, re.IGNORECASE)
        if arrangement and out["work_arrangement"] is None:
            out["work_arrangement"] = _quoted(arrangement.group(1), arrangement.group(0))
        if DEADLINE_CUES.search(stripped) and out["deadline"] is None:
            date_match = DATE_PHRASE.search(stripped)
            if date_match:
                out["deadline"] = _quoted(date_match.group(1).rstrip(".,"), stripped)
        if section and not label_match:
            item = BULLET.sub("", stripped)
            if section in out and len(out[section]) < 20:
                out[section].append(_quoted(item, stripped))
            if section == "mandatory_requirements" and re.search(
                r"\d+\+?\s*years?", item, re.IGNORECASE
            ):
                out["experience"].append(_quoted(item, stripped))

    seen_skills: set[str] = set()
    for skill in SKILLS:
        match = re.search(rf"(?<![\w]){re.escape(skill)}(?![\w])", job_description)
        if match and skill.lower() not in seen_skills:
            seen_skills.add(skill.lower())
            out["required_skills"].append(_quoted(skill, match.group(0)))
    for doc in DOCUMENTS:
        match = re.search(rf"(?<![\w]){re.escape(doc)}(?![\w])", job_description, re.IGNORECASE)
        if match:
            out["required_documents"].append(_quoted(match.group(0), match.group(0)))
    return out


def _sentences(text: str | None, limit: int) -> list[str]:
    if not text:
        return []
    items = [BULLET.sub("", line).strip() for line in text.splitlines()]
    return [item for item in items if 15 <= len(item) <= 200][:limit]


def interview_prep(prompt: str) -> dict[str, Any]:
    title = re.search(r"^Role: (.+)$", prompt, re.MULTILINE)
    role = title.group(1).strip() if title else "this role"
    jd = unwrap("JOB_DESCRIPTION", prompt)
    cv = unwrap("SUBMITTED_CV", prompt)
    approved_raw = unwrap("APPROVED_REQUIREMENTS", prompt)
    approved: dict[str, Any] = json.loads(approved_raw) if approved_raw else {}
    facts = extract(jd) if jd else {}
    skills = approved.get("required_skills") or [
        s["value"] for s in facts.get("required_skills", [])
    ]
    requirements = approved.get("mandatory_requirements") or [
        r["value"] for r in facts.get("mandatory_requirements", [])
    ]
    responsibilities = approved.get("responsibilities") or [
        r["value"] for r in facts.get("responsibilities", [])
    ]

    technical = [
        {
            "question": f"Walk me through how you have used {skill} in a recent project.",
            "why_asked": f"The job description lists {skill}.",
            "answer_outline": [
                "The context and goal",
                f"Your specific use of {skill}",
                "Trade-offs you made",
                "The outcome, with a number if possible",
            ],
        }
        for skill in skills[:4]
    ] or [
        {
            "question": f"What technical skills would you rely on most as a {role}, and how have you applied them?",
            "why_asked": "Interviewers check that your skills match the core of the role.",
            "answer_outline": [
                "Name two or three skills",
                "A concrete example for each",
                "What you would bring from day one",
            ],
        }
    ]
    behavioral = [
        {
            "question": "Tell me about a time you had to deliver something important under a tight deadline.",
            "why_asked": "Assesses prioritisation and composure.",
            "star_hint": "Situation: the deadline. Task: your part. Action: how you prioritised. Result: what shipped and what you learned.",
        },
        {
            "question": "Describe a disagreement with a colleague and how you resolved it.",
            "why_asked": "Assesses collaboration and communication.",
            "star_hint": "Focus on listening, the shared goal, and the outcome for the team.",
        },
    ]
    cv_questions = [
        {
            "question": f"Your CV mentions: “{line[:120]}”. Can you tell me more about that?",
            "cv_evidence": line[:300],
        }
        for line in _sentences(cv, 3)
    ]
    role_questions = [
        {
            "question": f"How would you approach this responsibility: {item.rstrip('.')}?",
            "why_asked": "It is listed as a responsibility of the role.",
        }
        for item in responsibilities[:3]
    ] or [
        {
            "question": f"What would you focus on in your first 90 days as {role}?",
            "why_asked": "Shows how you understand the role.",
        }
    ]
    topics = [f"Prepare an example that shows: {req.rstrip('.')}" for req in requirements[:4]]
    topics += [
        "Re-read the job description and your submitted CV",
        "Prepare two questions to ask the interviewer",
    ]
    return {
        "technical_questions": technical,
        "behavioral_questions": behavioral,
        "cv_questions": cv_questions,
        "role_questions": role_questions,
        "preparation_topics": topics,
    }


class FakeProvider(LLMProvider):
    name = "fake"
    model = "applyvault-fake-1"

    def complete(self, system: str, user: str, *, task: str) -> Completion:
        if task == "extraction":
            payload = extract(unwrap("JOB_DESCRIPTION", user) or "")
        elif task == "interview_prep":
            payload = interview_prep(user)
        else:
            raise ValueError(f"Unknown task {task}")
        return Completion(json.dumps(payload), self.model)
