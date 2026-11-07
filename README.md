# KaziTrail

**Your job search, organized.** KaziTrail gives every job application its own
permanent record: the original job description, the exact files you submitted,
what happened afterwards, reminders, and AI-assisted interview preparation.
Open any application months later and see exactly what happened.

It is not a job board: no job discovery, scraping or one-click applying.

## Quick start

Requirements: Docker with Compose v2. No AI key is needed.

```bash
git clone <this repo> kazitrail && cd kazitrail
docker compose up
```

Values come from `.env.example`; to override any of them, `cp .env.example .env`
and edit. On first start the backend waits for Postgres, migrates, creates the
private storage bucket and seeds a demo account.

| What | Where |
|---|---|
| App | http://localhost:5173 |
| Demo login | `demo@applyvault.dev` / `demo-password-2026` (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`) |
| API docs (OpenAPI/Swagger) | http://localhost:5173/api/v1/docs/ — schema at `/api/v1/schema/` |
| Email (Mailpit) | http://localhost:8025 |
| Storage console (MinIO) | http://localhost:9001 (`applyvault` / `applyvault-dev-secret`) |

Rebuild the demo data: `docker compose exec backend python manage.py seed_demo --reset`.
The demo has eight applications across every status, a versioned CV, frozen
submissions, a reviewed AI extraction, an interview-prep set, timelines,
questions and reminders.

## What it does

- **Accounts:** register, email verification, sign in/out, password reset, profile and time zone.
- **Applications:** create manually or from a pasted/uploaded job description; edit; search and
  filter; soft delete with 30-day restore. Views: Kanban (drag and drop, or a keyboard status
  menu), sortable table, and a calendar of deadlines and reminders. The view is kept in the URL.
- **Application record:** Overview, Job Description, Documents, Questions & Answers, Timeline,
  Reminders and Interview Prep, with a record completeness indicator (job description,
  submitted documents, history).
- **Job description:** the original text and file are saved permanently and can't be replaced.
  Scanned PDFs with no text ask you to paste the text once.
- **Documents:** a library of CVs, cover letters, transcripts, certificates and portfolios.
  Each upload is a new immutable version. The first move to **Applied** freezes the exact
  versions attached ("Submitted version" badge); later files are labelled
  "Added after submission". Preview PDFs (PDF.js) and images; DOCX is download-only.
- **AI** (fake provider by default): extraction where every value carries a quote checked
  against the source (unsupported values become "Not specified"), a side-by-side review that
  only changes your application when you approve, and interview practice questions built from
  your saved record with the disclaimer "AI-generated practice questions. These are not actual
  questions from the employer."
- **Reminders:** follow-ups, interviews, deadlines and more; in-app notifications and email;
  completing a follow-up prompts you to record what happened.
- **Analytics, export, deletion:** counts by status, submissions per week, completeness;
  a ZIP export (JSON, CSV and every file) behind an expiring link; permanent account deletion.

## Architecture

```
browser ──► frontend (Vite dev server locally; nginx in production)
              │  /api/* proxied → same origin, session cookie + CSRF
              ▼
           backend (Django + DRF; gunicorn in production) ──► PostgreSQL
              │                   └─► MinIO / S3 (private bucket, presigned GETs ≤ 5 min)
              ▼
           Redis ◄── worker (Celery) ◄── beat (reminders every minute, daily purge)
                        ├─► LLM provider (fake | OpenAI-compatible)
                        └─► SMTP (Mailpit locally)
```

| Path | Contents |
|---|---|
| `backend/` | Django 6, DRF, Celery. Apps: `accounts`, `companies`, `applications`, `documents`, `jobdescriptions`, `ai`, `reminders`, `exports`, `common` |
| `frontend/` | React 19, TypeScript (strict), Vite, Tailwind CSS 4, TanStack Query, React Hook Form + Zod, React Router, PDF.js |
| `e2e/` | Playwright journeys and accessibility checks (axe) against the Compose stack |
| `docs/` | `PRD.md`, `BUILD_BRIEF.md` (wins on conflicts), `DECISIONS.md`, `IMPLEMENTATION_PLAN.md`, `DEPLOYMENT.md`, `SECURITY.md` |

### API overview (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `GET auth/csrf`, `POST auth/register`, `auth/login`, `auth/logout`, `GET/PATCH auth/me`, `POST auth/change-password`, `auth/verify-email`, `auth/resend-verification`, `auth/password-reset`, `auth/password-reset/confirm`, `auth/ai-acknowledgement`, `auth/delete-account` |
| Applications | `GET/POST applications`, `GET/PATCH/DELETE applications/:id`, `POST applications/:id/status`, `POST applications/:id/restore`, `…/activities`, `…/questions` |
| Job description | `GET applications/:id/job-description`, `POST …/paste`, `…/upload`, `…/text`, `…/extract`, `PUT …/review`, `GET …/file` |
| Documents | `GET/POST documents`, `GET/PATCH/DELETE documents/:id`, `GET/POST documents/:id/versions`, `GET documents/versions/:id/download`, `GET/POST applications/:id/documents`, `POST …/documents/upload`, `PATCH/DELETE …/documents/:link` |
| AI | `GET/POST applications/:id/interview-prep`, `GET/PATCH interview-preps/:id`, `POST interview-preps/:id/retry`, `GET ai/usage` |
| Reminders | `GET/POST reminders`, `GET/PATCH reminders/:id`, `POST reminders/:id/complete`, `…/cancel`; `GET notifications`, `…/unread-count`, `POST notifications/:id/read`, `notifications/read-all` |
| Other | `GET dashboard/summary`, `GET analytics`, `GET meta`, `GET/POST exports`, `GET exports/:id/download`, `GET health` |

Lists are paginated (`?page=`, `?page_size=`, default 25, max 200). Errors use one
envelope: `{"error": {"code", "message", "details"}}`. Full schema: `/api/v1/schema/`.

## Configuration

Every variable is listed with comments in `.env.example` (local) and
`.env.production.example` (production). The most important:

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `FRONTEND_URL`, `CSRF_TRUSTED_ORIGINS` | Django and cookie/CSRF origin settings |
| `DATABASE_URL`, `REDIS_URL`, `CACHE_URL` | Postgres, Celery broker, throttling cache |
| `S3_*`, `PRESIGNED_URL_TTL_SECONDS` | Private object storage (≤ 300 s links) |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | SMTP (Mailpit locally) |
| `LLM_PROVIDER`, `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`, `AI_DAILY_LIMIT` | AI provider (`fake` needs no key) and daily limit |
| `THROTTLE_*` | Rate limits, e.g. `THROTTLE_LOGIN=5/15m` |
| `SEED_DEMO`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | Demo seeding on first start |

## Development and tests

```bash
# Backend: lint, format, types, migrations, schema, tests (inside the backend image)
docker compose run --rm --no-deps backend sh -c \
  "ruff check . && ruff format --check . && mypy . && python manage.py makemigrations --check --dry-run && pytest --cov"

# Frontend (Node 24, see frontend/.nvmrc)
cd frontend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build

# End-to-end and accessibility (stack running via docker compose up)
cd e2e && npm ci && npx playwright install chromium && npx playwright test
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

| Suite | Scope |
|---|---|
| Backend (pytest, 190+ tests, ~95% coverage) | FR-01–FR-10, cross-user access on every resource, AI failure keeps data, "Not specified", prompt injection, immutability, reminders concurrency, purge, export, deletion |
| Frontend (Vitest + RTL) | Auth, application create/edit/status, documents and freezing, extraction review, interview prep and disclaimer, reminders, settings |
| E2E (Playwright) | Journeys 1–5 from the brief, export + deletion, axe checks at 1280 px and 375 px, keyboard-only board use |

The mapping from FR-01–FR-10 to tests is in `docs/IMPLEMENTATION_PLAN.md`.

## Product decisions and trade-offs

The full log is `docs/DECISIONS.md`. Highlights:

- **The brief wins over the PRD** (D-001): session cookies instead of JWT, automatic freeze on
  the first move to Applied instead of a manual "Finalize" button, quote-backed extraction,
  5-minute presigned links.
- **Records are write-once** where it matters: document versions, frozen attachments and the
  original job description are immutable at the model layer. Account deletion is the one
  deliberate exception.
- **AI never blocks or overwrites:** data is saved before any AI call, failures only change a
  status, and nothing reaches the application until you approve the review.
- **Deadlines are never inferred:** stored as written; parsed only when unambiguous with a year.
- **Opaque storage keys** so presigned URLs reveal nothing about the user or file (D-019).
- **Reminders** are claimed with `SELECT … FOR UPDATE SKIP LOCKED` plus a unique notification
  per reminder, so concurrent workers and email retries can't duplicate anything.

## Future work (out of scope for this release)

Job URL scraping, browser extension, Gmail/Outlook sync, LinkedIn, job discovery or auto-apply,
payments, native mobile apps, custom statuses (statuses live in one place,
`backend/apps/applications/statuses.py`, ready for this), success prediction, a standalone AI
chat, OCR for scanned job descriptions, DOCX preview, malware scanning of uploads.

## Deployment and security

See `docs/DEPLOYMENT.md` (production images, `docker-compose.prod.yml`, storage, email,
operations) and `docs/SECURITY.md` (the review, with how each control is tested).
