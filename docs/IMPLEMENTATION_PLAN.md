# Implementation Plan

Repo state at start: empty directory, no git history. Everything below is new.

## Architecture

```
browser ──► frontend (Vite dev server / nginx in prod)
              │  /api/* proxied (same origin → session cookie + CSRF)
              ▼
           backend (Django + DRF, gunicorn in prod) ──► PostgreSQL
              │                    │
              │ enqueue            └──► MinIO / S3 (private bucket, presigned GETs)
              ▼
           Redis ◄── worker (Celery)  ◄── beat (Celery Beat: reminders/min, purge daily)
                         │
                         ├──► LLM provider (fake | OpenAI-compatible)
                         └──► SMTP (Mailpit locally)
```

### Backend layout (`backend/`)

| Path | Contents |
|---|---|
| `config/` | settings (`base`, `dev`, `test`, `prod`), urls, celery app |
| `apps/common` | UUID/timestamp base model, error envelope, pagination, throttles, storage service, file validation, request-ID logging |
| `apps/accounts` | `User` (email login, timezone, AI ack, notification prefs), auth endpoints, verification and reset emails, account deletion job |
| `apps/companies` | `Company` (per-user, case-insensitive unique name) |
| `apps/applications` | `Application`, `ApplicationQuestion`, `ApplicationActivity`, statuses (single source), status service + freeze, dashboard, analytics, purge job, meta endpoint |
| `apps/documents` | `Document`, `DocumentVersion`, `ApplicationDocument`, upload/version/download/preview |
| `apps/jobdescriptions` | `JobDescription`, paste/upload, text extraction, review/approve |
| `apps/ai` | provider interface, fake + OpenAI-compatible providers, prompts, schemas, quote verification, PII scrubbing, usage limits, extraction and interview-prep tasks, `InterviewPreparation` |
| `apps/reminders` | `Reminder`, `Notification`, dispatch task, email task |
| `apps/exports` | `ExportJob`, ZIP builder task |
| `tests/` | cross-cutting tests (cross-user access matrix, FR coverage) |

### Frontend layout (`frontend/src/`)

| Path | Contents |
|---|---|
| `app/` | router, providers, layout (sidebar, top bar, bell, global search) |
| `components/` | UI primitives: Button, Field, Dialog, Tabs, Badge, Skeleton, EmptyState, ErrorState, Toast, PdfPreview |
| `lib/` | API client (CSRF, error envelope), query client, date/timezone helpers |
| `features/*` | auth, dashboard, applications (table/board/calendar, detail tabs), documents, jobdescriptions, ai (review, interview prep), reminders, analytics, settings |

## Phases

Each phase ends with: all tests + lint + type checks green, README and
DECISIONS updated, status report.

### Phase 1 — Foundation
1. Docker Compose: frontend, backend, worker, beat, postgres, redis, minio (+ bucket init), mailpit. `.env.example`.
2. Django project, DRF, drf-spectacular (`/api/v1/schema/`, `/api/v1/docs/`), error envelope, pagination, structlog.
3. Accounts: register, verify email, login, logout, me, change password, password reset, CSRF endpoint, throttles.
4. Models for every entity in the brief (migrations committed), so later phases only add behaviour.
5. Companies + Applications CRUD, filters/search/order, status endpoint with system activity, soft delete + restore, dashboard summary, meta endpoint.
6. Frontend scaffold: Tailwind theme, router, auth pages, layout, dashboard, My Applications with table/board/calendar persisted in `?view=`, new application (manual).
7. CI workflow: ruff (lint + format), mypy, pytest, eslint, prettier, tsc, vitest, build, Playwright.

### Phase 2 — Application Vault
1. Storage service (boto3 + in-memory test impl), file validation (magic bytes, 10 MB, `.doc` rejection, type rules).
2. Document library API: create with v1, new version, list grouped, archive, version history, associated applications, download/preview (presigned ≤5 min).
3. Job description paste/upload with text extraction (pypdf, python-docx) and no-text handling.
4. Application documents: attach, remove, freeze on first Applied, 409 on frozen, "Added after submission".
5. Questions & answers, timeline activities and notes.
6. Frontend: detail page with tabs, completeness indicator, document library page, PDF.js/image preview, Add Application by paste/upload.

### Phase 3 — AI and reminders
1. LLM interface, fake + OpenAI-compatible providers, pydantic schemas, retry-once, prompt delimiting, PII scrubbing, daily limit, AI acknowledgement.
2. Extraction task, quote verification, deadline rule, side-by-side review and approve.
3. Interview prep task and UI with disclaimer and notes.
4. Reminders CRUD, Beat dispatch with `select_for_update(skip_locked=True)`, notifications, email with retry, bell, Calendar & Reminders page, follow-up completion prompt.

### Phase 4 — Launch readiness
1. Analytics endpoint and page.
2. Export job (ZIP: JSON, CSV, files) with expiring authorized link.
3. Purge job, account deletion job.
4. Security review (queryset scoping grep, logging review), accessibility and responsive pass.
5. `seed_demo`, production Dockerfiles + `docker-compose.prod.yml`, deployment docs.
6. Playwright journeys 1–5.

## Status

All four phases are complete (see git history: one commit per phase plus the
backend foundation). Each phase ended with lint, format, type checks and all
tests green.

## Test matrix

| Requirement | Backend tests (`backend/`) | Frontend / E2E |
|---|---|---|
| FR-01 Accounts | `apps/accounts/tests/test_auth.py` | `features/auth/auth.test.tsx`; E2E all journeys register, journey 5 verifies email via Mailpit |
| FR-02 Applications | `apps/applications/tests/test_applications_api.py`, `test_status.py` | `ApplicationForm.test.tsx`, `ApplicationsPage.test.tsx` |
| FR-03 Dashboard & views | `test_applications_api.py::test_dashboard_summary` | `ApplicationsPage.test.tsx` (board, table sort, URL view); `e2e/tests/foundation.spec.ts` |
| FR-04 Job description record | `apps/jobdescriptions/tests/test_job_description.py` | E2E journeys 1 and 3 |
| FR-05 Extraction & review | `apps/ai/tests/test_extraction.py`, `test_quotes_and_deadlines.py`, `test_injection.py` | `ExtractionPanel.test.tsx`; E2E journey 1 |
| FR-06 Library & versions | `apps/documents/tests/test_library.py`, `test_validation.py`, `test_immutability.py`, `apps/common/tests/test_s3_storage.py` | E2E journey 2 |
| FR-07 Submission snapshots | `apps/documents/tests/test_freeze.py`, `apps/applications/tests/test_status.py` | `DocumentsTab.test.tsx`; E2E journeys 1 and 2 |
| FR-08 Q&A, timeline, notes | `apps/applications/tests/test_timeline_qa.py` | E2E journey 3 |
| FR-09 Reminders | `apps/reminders/tests/test_reminders_api.py`, `test_dispatch.py` (incl. concurrent workers, email retry) | `Reminders.test.tsx`; E2E journey 5 |
| FR-10 Interview prep | `apps/ai/tests/test_interview_prep.py` | `InterviewPrepTab.test.tsx`; E2E journey 4 |
| Cross-user access | `tests/test_cross_user_access.py` (every resource: read, update, delete, download, body IDs, lists) | — |
| AI failure keeps data | `apps/ai/tests/test_failures.py` | `ExtractionPanel.test.tsx` (failed state) |
| Launch readiness | `test_analytics.py`, `apps/exports/tests/test_exports.py`, `test_purge.py`, `apps/accounts/tests/test_account_deletion.py`, `test_seed_demo.py`, `apps/ai/tests/test_providers.py` | `SettingsPage.test.tsx`; `e2e/tests/data-rights.spec.ts`, `e2e/tests/accessibility.spec.ts` |
