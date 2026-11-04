"""Realistic demo data for the seeded account. Dates are relative to today."""

from dataclasses import dataclass, field
from datetime import timedelta

from django.db import models
from django.utils import timezone

from apps.accounts.models import User
from apps.applications.models import (
    ActivityType,
    Application,
    ApplicationActivity,
    ApplicationQuestion,
)
from apps.applications.services import change_status, create_application
from apps.common.files import validate_file
from apps.common.pdf import text_pdf
from apps.companies.models import get_or_create_company
from apps.documents import services as documents
from apps.documents.models import ApplicationDocument, DocumentVersion
from apps.jobdescriptions.services import save_pasted
from apps.reminders.models import Reminder

CV_V1 = [
    "Jordan Avery",
    "Product Designer",
    "",
    "PROFILE",
    "Product designer with six years of experience shaping B2B and health products, from research to shipped interface.",
    "",
    "EXPERIENCE",
    "Senior Product Designer, Brightside Labs (2022 - present)",
    "- Led the redesign of a clinical scheduling tool used by 400 clinics; cut booking time by 38%.",
    "- Built and maintained the Figma design system and React component guidelines.",
    "- Ran fortnightly usability studies with nurses and receptionists.",
    "Product Designer, Kite Analytics (2019 - 2022)",
    "- Designed dashboards and data exploration flows for finance teams.",
    "- Partnered with engineering on accessibility (WCAG 2.1 AA) remediation.",
    "",
    "SKILLS",
    "Figma, prototyping, user research, design systems, accessibility, HTML/CSS, stakeholder workshops",
    "",
    "EDUCATION",
    "BA Interaction Design, University of Leeds",
]

CV_V2 = [*CV_V1[:12], "- Mentored two junior designers through their first year.", *CV_V1[12:]]

COVER_LETTER = [
    "Dear Hiring Team,",
    "",
    "I'm applying for the Senior Product Designer role. I've spent the last three years designing tools that",
    "busy professionals rely on every day, and the craft and care in your products stand out to me.",
    "",
    "At Brightside Labs I led the redesign of our scheduling tool, working closely with clinicians to make",
    "complex workflows feel simple. I'd love to bring the same approach to your team.",
    "",
    "Kind regards,",
    "Jordan Avery",
]

NORTHWIND_JD = """Senior Product Designer
Northwind Studio
Location: London, UK (Hybrid, 2 days in office)
Employment type: Full-time
Salary: £70,000 - £82,000

About the role
Northwind Studio builds planning software for architecture practices. We're looking for a Senior Product Designer to own the end-to-end experience of our project scheduling product.

Responsibilities
- Lead discovery and design for the scheduling product, from research to shipped interface
- Run usability testing with architects and project managers
- Contribute to and evolve our design system
- Work closely with engineers and product managers in a cross-functional squad

Requirements
- 5+ years of experience in product design
- A portfolio showing shipped work on complex, data-heavy products
- Strong prototyping skills in Figma
- Experience running user research

Nice to have
- Experience with design systems in React
- Familiarity with the architecture or construction industry

Benefits
- 30 days holiday plus bank holidays
- Private health insurance
- £1,000 annual learning budget

How to apply
Please send your CV, a cover letter and a link to your portfolio.
Applications close on 28 February 2026.
"""

LUMEN_JD = """Frontend Engineer (Design Systems)
Lumen Health
Location: Remote (UK)
Employment type: Full-time

Responsibilities
- Build and maintain our React component library
- Partner with designers to ship accessible, consistent interfaces
- Improve performance across our patient-facing web app

Requirements
- 3+ years building production React applications with TypeScript
- Strong understanding of web accessibility (WCAG 2.1 AA)
- Experience with automated testing

Benefits
- Fully remote with quarterly team meetups
- Share options

Applications close on 15 March 2026.
"""

FIELDNOTE_JD = """UX Researcher
Fieldnote
Location: Manchester, UK
Employment type: Contract (6 months)

Responsibilities
- Plan and run qualitative research with small business owners
- Synthesize findings into clear recommendations

Requirements
- 3+ years of experience in UX research
- Experience with remote interviewing tools

Please apply with your CV and a short case study.
"""


@dataclass
class _Spec:
    title: str
    company: str
    location: str
    employment_type: str
    work_arrangement: str
    compensation: str
    statuses: list[str]
    days_ago: int
    deadline_in: int | None = None
    jd: str | None = None
    attach: list[str] = field(default_factory=list)
    notes: str = ""
    recruiter: tuple[str, str] | None = None
    activities: list[tuple[str, str, str, int]] = field(default_factory=list)
    questions: list[tuple[str, str]] = field(default_factory=list)
    reminders: list[tuple[str, str, int]] = field(default_factory=list)


SPECS = [
    _Spec(
        "Senior Product Designer",
        "Northwind Studio",
        "London, UK",
        "full_time",
        "hybrid",
        "£70,000 - £82,000",
        ["preparing", "applied", "interview"],
        34,
        jd=NORTHWIND_JD,
        attach=["cv1", "cover", "portfolio"],
        notes="Hiring manager is Priya (Head of Design). Team of 6 designers.",
        recruiter=("Sam Okafor", "sam.okafor@northwind.example"),
        activities=[
            (
                "call",
                "Recruiter screen with Sam",
                "30 minutes. Discussed the team, hybrid policy and salary range.",
                20,
            ),
            (
                "email",
                "Invited to portfolio interview",
                "Panel with Priya and two designers next week.",
                9,
            ),
        ],
        questions=[
            (
                "Why do you want to work at Northwind Studio?",
                "Your scheduling product solves a problem I know well from clinics, and the team's craft is visible in every release.",
            ),
            ("What is your notice period?", "One month."),
        ],
        reminders=[("interview", "Portfolio interview with the design panel", 2)],
    ),
    _Spec(
        "Frontend Engineer (Design Systems)",
        "Lumen Health",
        "Remote (UK)",
        "full_time",
        "remote",
        "",
        ["applied"],
        12,
        jd=LUMEN_JD,
        attach=["cv2"],
        reminders=[("follow_up", "Follow up with Lumen Health", 1)],
    ),
    _Spec(
        "Data Visualisation Designer",
        "Harbor & Co",
        "Bristol, UK",
        "full_time",
        "onsite",
        "£55,000",
        ["applied", "assessment"],
        21,
        attach=["cv1"],
        activities=[
            (
                "assessment",
                "Take-home exercise received",
                "Redesign a quarterly report dashboard. Due in 5 days.",
                6,
            )
        ],
        reminders=[("assessment", "Submit the take-home exercise", 3)],
    ),
    _Spec(
        "UX Researcher",
        "Fieldnote",
        "Manchester, UK",
        "contract",
        "onsite",
        "£450/day",
        ["saved"],
        3,
        deadline_in=9,
        jd=FIELDNOTE_JD,
    ),
    _Spec(
        "Product Designer, Payments",
        "Atlas Freight",
        "London, UK",
        "full_time",
        "hybrid",
        "",
        ["preparing"],
        5,
        deadline_in=16,
        notes="Need to tailor the CV toward payments and B2B.",
    ),
    _Spec(
        "Design Systems Lead",
        "Meridian",
        "Edinburgh, UK",
        "full_time",
        "hybrid",
        "£90,000",
        ["applied", "interview", "offer"],
        60,
        attach=["cv1", "cover"],
        activities=[
            ("note", "Offer received", "Verbal offer; written offer to follow by Friday.", 4)
        ],
    ),
    _Spec(
        "Senior UX Designer",
        "Cobalt Bank",
        "London, UK",
        "full_time",
        "hybrid",
        "",
        ["applied", "rejected"],
        75,
        attach=["cv1"],
        activities=[
            ("email", "Rejection email", "They went with a candidate with banking experience.", 50)
        ],
    ),
    _Spec(
        "Content Designer",
        "Civic Digital",
        "Remote (UK)",
        "part_time",
        "remote",
        "",
        ["applied", "withdrawn"],
        48,
        attach=["cv1"],
    ),
]


def _version(
    user: User,
    title: str,
    type: str,
    lines: list[str],
    filename: str,
    existing: DocumentVersion | None = None,
) -> DocumentVersion:
    file = validate_file(text_pdf(lines, title=title), filename, allow_images=False)
    if existing is not None:
        return documents.add_version(existing.document, file)
    return documents.create_document(user, title=title, type=type, file=file)


def build_demo_account(email: str, password: str) -> User:
    now = timezone.now()
    user = User.objects.create_user(
        email=email,
        password=password,
        full_name="Jordan Avery",
        timezone="Europe/London",
        email_verified_at=now,
    )
    cv1 = _version(user, "Product Designer CV", "cv", CV_V1, "Jordan-Avery-CV.pdf")
    cover = _version(
        user,
        "Cover letter (general)",
        "cover_letter",
        COVER_LETTER,
        "Jordan-Avery-Cover-Letter.pdf",
    )
    portfolio = _version(
        user,
        "Portfolio highlights",
        "portfolio",
        [
            "Portfolio highlights",
            "",
            "1. Clinic scheduling redesign",
            "2. Finance dashboards",
            "3. Design system",
        ],
        "Portfolio-Highlights.pdf",
    )
    files = {"cv1": cv1, "cover": cover, "portfolio": portfolio}

    for spec in SPECS:
        company = get_or_create_company(user, spec.company)
        app = create_application(
            user,
            company=company,
            job_title=spec.title,
            location=spec.location,
            employment_type=spec.employment_type,
            work_arrangement=spec.work_arrangement,
            compensation=spec.compensation,
            notes=spec.notes,
            deadline=(now + timedelta(days=spec.deadline_in)).date() if spec.deadline_in else None,
            recruiter_name=spec.recruiter[0] if spec.recruiter else "",
            recruiter_email=spec.recruiter[1] if spec.recruiter else "",
        )
        if spec.jd:
            save_pasted(app, spec.jd)
        for key in spec.attach:
            version = files.get(key)
            if key == "cv2":
                version = files.setdefault(
                    "cv2", _version(user, "", "cv", CV_V2, "Jordan-Avery-CV-2026.pdf", existing=cv1)
                )
            assert version is not None
            documents.attach_version(app, version, version.document.type)
        for status in spec.statuses:
            if status != "saved":
                change_status(app, status, user=user)
        for index, (question, answer) in enumerate(spec.questions):
            ApplicationQuestion.objects.create(
                application=app, question=question, answer=answer, order=index
            )
        for type, title, body, days in spec.activities:
            ApplicationActivity.objects.create(
                application=app,
                type=type,
                title=title,
                body=body,
                occurred_at=now - timedelta(days=days),
            )
        for type, title, days in spec.reminders:
            Reminder.objects.create(
                owner=user,
                application=app,
                type=type,
                title=title,
                remind_at=now + timedelta(days=days),
            )

        # Spread the system history over the weeks since the application was created.
        start = now - timedelta(days=spec.days_ago)
        system = list(app.activities.filter(is_system_generated=True).order_by("created_at"))
        step = timedelta(days=spec.days_ago / max(len(system), 1))
        for index, activity in enumerate(system):
            ApplicationActivity.objects.filter(pk=activity.pk).update(
                occurred_at=start + step * index
            )
        applied = (
            app.activities.filter(type=ActivityType.SUBMITTED)
            .values_list("occurred_at", flat=True)
            .first()
        )
        latest = (
            app.activities.order_by("-occurred_at").values_list("occurred_at", flat=True).first()
        )
        if applied:
            # Demo data only: backdate the freeze time to match the simulated history.
            # The model layer blocks updates to frozen rows, so bypass it explicitly.
            models.QuerySet.update(
                ApplicationDocument.objects.filter(application=app, is_frozen=True),
                frozen_at=applied,
            )
        Application.objects.filter(pk=app.pk).update(
            created_at=start,
            updated_at=latest or start,
            submitted_at=applied,
            date_applied=applied.date() if applied else None,
        )
    return user
