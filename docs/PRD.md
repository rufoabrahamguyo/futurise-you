# KaziTrail — Product Requirements (Master Build Prompt)

> Provided by the product owner. Where this document conflicts with
> `docs/BUILD_BRIEF.md`, the build brief wins (it resolves open decisions).
> Each resolved conflict is recorded in `docs/DECISIONS.md`. The functional
> requirements FR-01 to FR-10 are defined in `docs/DECISIONS.md` (D-002),
> because this document does not number them.

---

## SYSTEM ROLE

You are a senior full-stack engineer and product architect. You will build **KaziTrail**, a production-quality SaaS web application, end to end. You have full autonomy to make reasonable technical decisions within the constraints below. You must prioritize correctness, security, data integrity, and clean, maintainable code over feature quantity. Do not skip steps. Do not leave TODOs. Every module you deliver must be functional, tested, and documented.

---

## PRODUCT OVERVIEW

**KaziTrail** — "Your job search, organized."

A web-based job application management platform for all job seekers (students, graduates, career switchers, experienced professionals). Every job application gets its own permanent, organized record: job description, exact documents submitted, status history, timeline, reminders, and AI-assisted preparation.

**Core product principle:** A user must be able to open any application months later and understand exactly what happened without searching emails or folders.

**MVP scope is strict.** Do not build anything in the "Out of Scope" list until the MVP is complete and passing all acceptance criteria.

---

## TECH STACK (NON-NEGOTIABLE)

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State / data | React Query (TanStack Query), React Hook Form + Zod |
| PDF preview | PDF.js (`react-pdf`) |
| Backend | Django 5 + Django REST Framework |
| Database | PostgreSQL 16 |
| Object storage | S3-compatible (use `django-storages` + MinIO for local dev) |
| Async tasks | Celery + Redis |
| LLM | Provider-agnostic abstraction; default to an OpenAI-compatible API with a configurable endpoint |
| Auth | JWT (SimpleJWT) with refresh + access tokens |
| Containerization | Docker + docker-compose (Postgres, Redis, MinIO, backend, worker, frontend) |
| Email | SMTP (console backend in dev, real provider in prod via env vars) |
| Testing | pytest + pytest-django + factory_boy; Vitest + React Testing Library |
| Lint/format | ruff + black (Python); eslint + prettier (TS) |

Do **not** substitute frameworks. Do **not** add a headless UI library beyond Tailwind + headlessui if truly needed.

---

## REPOSITORY STRUCTURE

```
applyvault/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── applyvault/            # Django project
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── celery.py
│   ├── apps/
│   │   ├── accounts/          # custom User, auth endpoints
│   │   ├── companies/
│   │   ├── applications/
│   │   ├── documents/
│   │   ├── ai/                # LLM provider abstraction + extraction/prep
│   │   ├── reminders/
│   │   └── common/            # base models, permissions, pagination
│   └── tests/
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── app/               # routes, providers, layouts
    │   ├── features/
    │   │   ├── auth/
    │   │   ├── dashboard/
    │   │   ├── applications/
    │   │   ├── documents/
    │   │   ├── reminders/
    │   │   └── ai/
    │   ├── components/        # shared UI primitives
    │   ├── lib/               # api client, query client, helpers
    │   └── types/
    └── tests/
```

---

## DATABASE SCHEMA (BUILD EXACTLY THIS)

Every user-owned row must have an FK to `User`. **Never rely on frontend filtering for authorization.** All querysets must be scoped in the backend.

```python
# accounts
class User(AbstractUser):
    email = models.EmailField(unique=True)     # login via email
    full_name = models.CharField(max_length=255, blank=True)
    # + created_at, updated_at via base model

# companies
class Company(models.Model):
    owner = FK(User, on_delete=CASCADE, related_name="companies")
    name = models.CharField(max_length=255)
    website = models.URLField(blank=True)
    notes = models.TextField(blank=True)
    # unique_together = (owner, lower(name)) enforced via functional index

# applications
class Application(models.Model):
    class Status(models.TextChoices):
        SAVED = "saved"
        PREPARING = "preparing"
        APPLIED = "applied"
        ASSESSMENT = "assessment"
        INTERVIEW = "interview"
        OFFER = "offer"
        REJECTED = "rejected"
        WITHDRAWN = "withdrawn"

    owner = FK(User, on_delete=CASCADE, related_name="applications")
    company = FK(Company, on_delete=PROTECT, related_name="applications")
    job_title = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    employment_type = models.CharField(max_length=50, blank=True)   # full-time, part-time, internship, contract
    work_arrangement = models.CharField(max_length=20, blank=True)  # remote/hybrid/onsite
    salary = models.CharField(max_length=120, blank=True)
    job_url = models.URLField(blank=True)
    application_deadline = models.DateField(null=True, blank=True)
    date_applied = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SAVED)
    notes = models.TextField(blank=True)
    # created_at, updated_at

# job descriptions (1:1 with application in MVP, but keep as separate model)
class JobDescription(models.Model):
    application = OneToOneField(Application, on_delete=CASCADE, related_name="job_description")
    raw_text = models.TextField(blank=True)
    original_file = FK("documents.Document", null=True, blank=True, on_delete=SET_NULL, related_name="+")
    extracted = models.JSONField(default=dict)     # structured output from LLM
    extraction_status = models.CharField(max_length=20, default="pending")  # pending|processing|ready|failed
    extraction_error = models.TextField(blank=True)
    extracted_at = models.DateTimeField(null=True, blank=True)

# documents
class Document(models.Model):
    """Master documents library entry (reusable)."""
    owner = FK(User, on_delete=CASCADE, related_name="documents")
    kind = models.CharField(max_length=30)  # cv|cover_letter|transcript|certificate|portfolio|other
    name = models.CharField(max_length=255)
    # current_version points at the latest DocumentVersion
    current_version = FK("DocumentVersion", null=True, blank=True, on_delete=SET_NULL, related_name="+")

class DocumentVersion(models.Model):
    """Immutable binary version. Uploading a new version creates a new row; never overwrite."""
    document = FK(Document, on_delete=CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    file = models.FileField(storage=private_storage, upload_to="docs/%Y/%m/")
    file_name = models.CharField(max_length=255)
    file_size = models.BigIntegerField()
    mime_type = models.CharField(max_length=100)
    checksum = models.CharField(max_length=64)   # sha256
    created_at = models.DateTimeField(auto_now_add=True)
    # unique_together = (document, version_number)

class ApplicationDocument(models.Model):
    """Immutable snapshot: links an application to a specific DocumentVersion at submission time."""
    application = FK(Application, on_delete=CASCADE, related_name="attached_documents")
    document_version = FK(DocumentVersion, on_delete=PROTECT, related_name="+")
    role = models.CharField(max_length=30)  # cv|cover_letter|portfolio|transcript|certificate|other
    is_submitted_snapshot = models.BooleanField(default=False)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    # Constraint: once is_submitted_snapshot=True, all fields are read-only (enforced in model.save)

# activities
class ApplicationActivity(models.Model):
    application = FK(Application, on_delete=CASCADE, related_name="activities")
    kind = models.CharField(max_length=40)   # status_change|note|document_attached|reminder|interview_prep|submitted
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_by = FK(User, on_delete=SET_NULL, null=True)  # null for system-generated

# reminders
class Reminder(models.Model):
    application = FK(Application, on_delete=CASCADE, related_name="reminders")
    owner = FK(User, on_delete=CASCADE, related_name="reminders")
    kind = models.CharField(max_length=30)  # deadline|follow_up|interview|assessment|other
    title = models.CharField(max_length=255)
    due_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)
    channel = models.CharField(max_length=10, default="both")   # in_app|email|both

# interview prep
class InterviewPreparation(models.Model):
    application = FK(Application, on_delete=CASCADE, related_name="interview_preps")
    generated_at = models.DateTimeField(auto_now_add=True)
    model_name = models.CharField(max_length=80, blank=True)
    prompt_version = models.CharField(max_length=20, default="v1")
    content = models.JSONField(default=dict)   # structured question sets + prep topics
    user_notes = models.TextField(blank=True)
```

**Rules to enforce in the backend:**
- `ApplicationDocument` created with `is_submitted_snapshot=True` must be immutable (block updates/deletes).
- `DocumentVersion` rows are never edited; a new upload creates a new version and updates `Document.current_version`.
- Every list/detail view filters by `request.user`.
- Files are served only through a signed-URL endpoint that verifies ownership.
- All foreign keys from user-owned models eventually trace back to `request.user`.

---

## API CONTRACT (DRF)

Use `/api/v1/` prefix. JWT in `Authorization: Bearer <token>`. All list endpoints paginated (page number + page size, default 25). All errors use a consistent shape: `{ "error": { "code": "...", "message": "...", "details": {...} } }`.

### Auth
- `POST /auth/register` — {email, password, full_name}
- `POST /auth/login` — returns access + refresh
- `POST /auth/refresh`
- `POST /auth/logout` — blacklist refresh
- `GET /auth/me`
- `PATCH /auth/me`
- `POST /auth/change-password`
- `POST /auth/delete-account` — cascades all user data

### Applications
- `GET /applications` — supports `?status=`, `?q=`, `?ordering=`, `?company=`, pagination
- `POST /applications`
- `GET /applications/:id`
- `PATCH /applications/:id`
- `DELETE /applications/:id`
- `POST /applications/:id/status` — {status, note?}; creates activity + reminder side-effects
- `GET /applications/:id/activities` — paginated
- `POST /applications/:id/activities` — manual note
- `GET /applications/:id/documents`
- `POST /applications/:id/documents` — attach {document_version_id, role, snapshot: bool}
- `POST /applications/:id/documents/:link_id/finalize` — freezes snapshot
- `DELETE /applications/:id/documents/:link_id` — rejected if snapshot

### Job description
- `POST /applications/:id/job-description/upload` — multipart; enqueues extraction
- `POST /applications/:id/job-description/paste` — {text}
- `GET /applications/:id/job-description`
- `POST /applications/:id/job-description/reextract`
- `PATCH /applications/:id/job-description/extracted` — allow user to correct AI output

### Documents
- `GET /documents` — library
- `POST /documents` — multipart; creates Document + DocumentVersion 1
- `POST /documents/:id/versions` — multipart; new immutable version
- `GET /documents/:id/versions`
- `GET /documents/versions/:version_id/download` — signed URL response
- `DELETE /documents/:id`

### Reminders
- `GET /reminders?scope=upcoming|overdue|completed`
- `POST /reminders`
- `PATCH /reminders/:id`
- `POST /reminders/:id/complete`

### AI
- `POST /applications/:id/interview-prep` — returns job id; poll status
- `GET /applications/:id/interview-prep`
- `PATCH /interview-preps/:id` — save user notes

### Dashboard
- `GET /dashboard/summary` — counts by status, follow-ups due, recent updates, weekly activity

All LLM operations go through Celery. Endpoints return `202 Accepted` with `{job_id}`. Poll via `GET /jobs/:id`.

---

## LLM INTEGRATION SPECIFICATION

Create `apps/ai/provider.py` with an abstract `LLMProvider` interface and one concrete `OpenAICompatibleProvider` that reads `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL` from env. Also implement a `FakeProvider` for tests and local dev (returns deterministic fixtures).

### Job description extraction prompt (contract)

Return **strict JSON only**, matching this schema. If a field is unavailable, use `null` — never invent values. Never invent deadlines.

```json
{
  "job_title": "string|null",
  "company_name": "string|null",
  "location": "string|null",
  "employment_type": "string|null",
  "work_arrangement": "string|null",
  "deadline": "YYYY-MM-DD|null",
  "salary": "string|null",
  "required_skills": ["string"],
  "preferred_skills": ["string"],
  "education": ["string"],
  "experience": ["string"],
  "mandatory_requirements": ["string"],
  "preferred_qualifications": ["string"],
  "responsibilities": ["string"],
  "benefits": ["string"],
  "application_instructions": ["string"],
  "required_documents": ["string"]
}
```

Server-side validation:
- Parse; if invalid JSON → retry once with a stricter instruction; if still invalid → set `extraction_status="failed"`, keep raw text, log.
- Validate date format; reject hallucinated deadlines with a warning surfaced in UI ("Verify this date").
- Save the model name and prompt version on the record.

### Interview prep prompt (contract)

Inputs: extracted JD, submitted CV text (see below), submitted cover letter text, job title, company. Output must be structured JSON:

```json
{
  "disclaimer": "AI-generated practice material. Not actual employer interview questions.",
  "technical_questions": [{ "question": "string", "why_asked": "string", "answer_outline": ["string"] }],
  "behavioral_questions": [{ "question": "string", "why_asked": "string", "star_hint": "string" }],
  "cv_questions": [{ "question": "string", "cv_evidence": "string" }],
  "company_questions": [{ "question": "string", "rationale": "string" }],
  "preparation_topics": ["string"]
}
```

The `disclaimer` string must always be present and shown verbatim in the UI.

### CV text extraction

For CV/cover-letter text used in prompts: extract text server-side using `pdfplumber` for PDFs and `python-docx` for DOCX. Do **not** send raw files to the LLM. Never send more than the text needed for the specific operation. Strip metadata. Store no derived CV text unless the user opts in — ephemeral by default.

### Safety
- If a prompt would exceed the model's token limit, truncate the JD to the first 12,000 tokens and the CV to the first 6,000 tokens, and record truncation in metadata.
- Rate limit AI endpoints: 20/hour/user (configurable). Return `429` with retry-after.

---

## FRONTEND REQUIREMENTS

### Routes

```
/                     → redirect to /dashboard if authed, else /login
/login
/register
/dashboard
/applications                     → table view (list, filter, sort, search)
/applications/board               → kanban view
/applications/calendar            → calendar view
/applications/new
/applications/:id                 → application vault (detail)
/documents                        → library
/reminders                        → calendar + list
/ai/prep/:applicationId           → interview prep (also embedded in detail)
/settings                         → profile, password, delete account, export data
```

### Layout
Sidebar (collapsible) + top bar. Sidebar items: Dashboard, Applications, Documents, Reminders, Settings. `AI Assistant` is not a separate page — it lives inside each application.

### Dashboard
Cards: Total applications, In progress (preparing + applied + assessment), Interviews, Offers, Rejections, Follow-ups due this week. Below: "Recently updated" list (5 items) and a compact 14-day activity sparkline. Empty state must offer "Add your first application".

### Applications list
- Tabs: All / Saved / Preparing / Applied / Assessment / Interview / Offer / Rejected / Withdrawn.
- Table columns: Company, Position, Status, Deadline, Last updated.
- Search bar (debounced, backend), filters, sort.
- Board view: one column per status, drag-and-drop via native HTML5 DnD (do not add a DnD library). Dragging updates status via `POST /status`.
- Calendar view: month grid, dots for deadlines and reminders; clicking a day opens a drawer.

### Application detail (the vault) — most important screen
Tabs: **Overview · Job Description · Documents · Timeline · Interview Prep · Reminders**

Overview:
- Editable header (position, company, status pill with quick-change menu).
- Key/value grid: location, employment type, work arrangement, salary, deadline, date applied, URL.
- Notes (auto-save on blur, optimistic via React Query).
- Attachments list with download links.

Job Description:
- Upload (PDF/DOCX) or paste.
- Extraction state machine UI: `pending → processing (with spinner + poll) → ready | failed (with retry)`.
- When ready, show structured panels: Mandatory requirements, Preferred qualifications, Responsibilities, Benefits, Application instructions, Required documents.
- Each extracted field is editable (PATCH `/extracted`) with an "Edited by you" badge.
- Show a subtle banner: "AI-extracted. Review and correct anything before relying on it."
- Display `Not specified` everywhere a field is null.

Documents:
- Two sections: "Attached to this application" and "Attach from library".
- Attach action pulls from Document library or uploads a new version inline.
- A prominent **"Finalize submitted documents"** button. On click, sets `is_submitted_snapshot=true` on all attached docs, locks editing, and creates an activity. Show a lock icon and "Immutable copy" badge on finalized docs.
- Every finalized doc must have a permanent download endpoint.

Timeline:
- Reverse-chronological vertical timeline. Each entry shows kind icon, title, optional body, timestamp.
- Manual note composer at the top.

Interview Prep:
- If none: "Prepare with AI" button → confirm dialog explaining what data is sent to the LLM.
- While generating: skeleton + polling status endpoint.
- When ready: sections for technical, behavioral, CV, company questions + preparation topics. Each Q is collapsible with "why asked" and outline. Editable "My notes" per prep. Show the disclaimer at the top.

Reminders:
- List of upcoming/past reminders with complete + snooze.
- "Set follow-up" quick action (3 days / 1 week / custom).

### Documents library
- Grid of document cards with kind badge, current version, upload date, version count.
- Drawer for version history: each version shows file name, size, upload date, download.
- "Upload master document" + "Upload new version" flows.

### Reminders page
- Month calendar + list. Reminders colored by kind. Overdue items highlighted.

### Settings
- Profile (full name, email display).
- Change password.
- Export my data → downloads a JSON + a zip of documents via a signed endpoint.
- Delete my account → typed confirmation, then hard delete.

### Global UX rules
- All destructive actions require a confirmation dialog.
- All forms validated with Zod; server errors rendered inline.
- Optimistic updates for status changes and notes; on failure, roll back and toast.
- Loading skeletons for every list and detail.
- Empty states on every list.
- Keyboard-navigable; focus rings visible; contrast meets WCAG AA.
- Fully responsive down to 375px width.

---

## BACKEND IMPLEMENTATION NOTES

### Auth
- Use SimpleJWT. Password validators enforced. Login by email. Refresh tokens rotated with blacklist.
- Registration sends a welcome email (console in dev).
- Throttle login: 5 attempts / 15 min / IP+email.

### File handling
- Private S3 bucket. Never expose direct object URLs.
- Generate presigned URLs with 60-second expiry from a dedicated `download` action that checks ownership.
- Validate uploaded files: MIME whitelist (pdf, docx, doc, png, jpg, txt), max 10 MB, extension + magic-byte check.
- Compute SHA-256 checksum on every upload; store in `DocumentVersion`.

### Celery tasks
- `extract_job_description(application_id, job_description_id)`
- `generate_interview_prep(application_id)`
- `send_reminder_email(reminder_id)`
- `check_due_reminders()` — scheduled every minute via Celery Beat.
- On any AI failure: log with structured context (application_id, user_id, error, model). Never lose input.

### Reminders
- When a reminder is due and not yet notified, enqueue an in-app notification row (add a `Notification` model or mark `notified_at` and surface via dashboard) and an email.
- Timezone: respect `User.timezone` (add to User). Default to UTC.

### Data export / deletion
- Export builds a zip: `profile.json`, `applications.json`, `documents/<...>`. Stream, do not buffer in memory.
- Deletion: hard delete user + cascade; also delete objects from S3 (post-delete signal).

### Settings
- Read from env via `django-environ`. Provide `.env.example` with every variable. No secrets in code. Fail fast on startup if critical env vars are missing in prod.

### Logging & observability
- Structured JSON logs (via `structlog`). Request ID in every log line. Log all AI calls with token counts and duration. Never log full CV content.

---

## TESTING REQUIREMENTS (MUST SHIP WITH THE CODE)

Backend (pytest):
- Model tests: `ApplicationDocument` snapshot immutability, version numbering, user scoping.
- API tests: every endpoint's happy path + 401 + 403 (cross-user access) + validation error.
- AI tests: `FakeProvider` returns fixtures; extraction handles invalid JSON, missing fields, deadline validation.
- Task tests: idempotency of reminder checks; failure path leaves data intact.
- File tests: upload/download ownership, signed URL expiry, MIME rejection.

Frontend (Vitest + RTL):
- Auth flows.
- Application create/edit/status change.
- Document attach + finalize flow.
- Reminder creation.
- Interview prep render with mock data + disclaimer present.

Target: ≥80% backend coverage on `apps/applications`, `apps/documents`, `apps/ai`.

---

## SECURITY CHECKLIST (VERIFY BEFORE "DONE")

- [ ] Every queryset scoped to `request.user` (grep the codebase; no `Model.objects.all()` in views except for admin-only).
- [ ] Direct object URLs disabled; only signed downloads.
- [ ] JWT rotation + blacklist on logout.
- [ ] CORS restricted to the frontend origin.
- [ ] CSRF safe because JWT + SPA (no session auth).
- [ ] Rate limits on auth, AI, and file upload.
- [ ] No secrets in repo.
- [ ] No full CV or JD content in logs.
- [ ] AI requests never include metadata not needed.
- [ ] Data export and account deletion work end-to-end.

---

## BUILD ORDER (FOLLOW THIS EXACTLY — DO NOT REORDER)

**Phase 1 — Foundation**
1. Scaffold repo, docker-compose (Postgres, Redis, MinIO), `.env.example`, README.
2. Django project with settings split; DRF; SimpleJWT; structlog.
3. Custom `User`, register/login/refresh/me/change-password endpoints + tests.
4. Frontend scaffold (Vite + TS + Tailwind), auth provider, login/register pages, protected routing.
5. Company + Application models, migrations, CRUD endpoints, dashboard summary endpoint.
6. Dashboard + Applications list (table view) + new application form.

**Phase 2 — The Vault**
7. Document models + versioning + upload + private storage + signed downloads.
8. Documents library page + version drawer.
9. Application detail shell with tabs; Overview tab; status change with activity logging.
10. Attach documents + finalize snapshot flow (backend immutability enforced + UI lock).
11. Timeline (activity feed + manual notes).
12. Board view (drag-and-drop) and Calendar view.

**Phase 3 — AI + Reminders**
13. LLM provider abstraction + FakeProvider + Celery wiring + Job model.
14. Job description upload/paste + extraction task + structured UI + editable extracted fields.
15. Reminders model + endpoints + Celery Beat + email + in-app notifications + Reminders page.
16. Interview prep task + prompt + UI + disclaimer + editable notes.

**Phase 4 — Polish & Ship**
17. Settings: profile, password, export, delete.
18. Accessibility pass, responsive pass, empty states, skeleton loaders, toasts.
19. Full test suite green; coverage ≥80% on the three core apps.
20. README with setup, env vars, architecture diagram, API overview, and a "Product decisions" section.

At the end of each phase, run all tests, run linters, and report a short status with any open questions. Only proceed to the next phase when the previous one is fully green.

---

## ACCEPTANCE CRITERIA (THE BUILD IS DONE WHEN…)

1. A new user can register, add an application, paste/upload a JD, watch AI extract structured fields (with "Not specified" where absent), attach a CV as a snapshot, finalize it, mark the application as Applied, set a follow-up reminder, and later reopen the application and see the exact CV, original JD, structured requirements, and timeline — all in under 5 minutes of use.
2. Cross-user access is impossible at the API level (proven by tests).
3. A submitted document snapshot cannot be modified or deleted (proven by tests).
4. Interview prep generates structured questions with the disclaimer always present.
5. Reminder emails and in-app notifications fire within 2 minutes of the due time.
6. Export produces a complete archive; delete removes all data including S3 objects.
7. The app is fully usable on a 375px viewport and by keyboard only.
8. All tests pass; linters pass; `docker compose up` brings the app to a working state with a seeded demo account (`demo@applyvault.dev` / configurable password).

---

## OUT OF SCOPE (DO NOT BUILD IN THIS MVP)

- Job discovery / scraping / job board.
- One-click apply.
- Browser extension.
- Gmail/Outlook sync.
- LinkedIn integration.
- Mobile apps.
- Payment / billing.
- Team/collaboration features.
- Advanced analytics or success predictions.
- Custom user-defined statuses (schema is ready; UI ships later).

If you find yourself tempted to add any of these, stop and note it in the README's "Future work" section instead.

---

## DELIVERABLES

- Working monorepo with backend + frontend + docker-compose.
- Migrations committed.
- Seed command: `python manage.py seed_demo` creating a demo user with 3 applications, documents, and one interview prep.
- README with: overview, setup, env vars, architecture, API reference, test commands, seed instructions, and a "Product decisions & tradeoffs" section.
- No TODO comments in shipped code. No stubbed endpoints. No silently swallowed exceptions.
