# ApplyVault

**Your job search, organized.** ApplyVault gives every job application its own
permanent record: the original job description, the exact files you submitted,
what happened afterwards, reminders, and AI-assisted interview preparation.

> Status: Phases 1–3 (Foundation, Application Vault, AI and reminders) complete. See `docs/IMPLEMENTATION_PLAN.md`.

## Quick start

Requirements: Docker with Compose v2. No AI key is needed.

```bash
docker compose up
```

Values come from `.env.example`; to override any of them, `cp .env.example .env`
and edit. On first start the backend migrates, creates the private storage
bucket and seeds a demo account.

| What | Where |
|---|---|
| App | http://localhost:5173 |
| Demo login | `demo@applyvault.dev` / `demo-password-2026` (set `DEMO_USER_PASSWORD`) |
| API docs (OpenAPI) | http://localhost:5173/api/v1/docs/ |
| Email (Mailpit) | http://localhost:8025 |
| Storage console (MinIO) | http://localhost:9001 (`applyvault` / `applyvault-dev-secret`) |

Re-seed the demo account: `docker compose exec backend python manage.py seed_demo --reset`.

## Architecture

```
browser ──► frontend (Vite dev server; nginx in production)
              │  /api/* proxied → same origin, session cookie + CSRF
              ▼
           backend (Django + DRF) ──► PostgreSQL
              │                   └─► MinIO / S3 (private bucket, presigned GETs ≤ 5 min)
              ▼
           Redis ◄── worker (Celery) ◄── beat (reminders every minute, daily purge)
                        ├─► LLM provider (fake | OpenAI-compatible)
                        └─► SMTP (Mailpit locally)
```

- `backend/` — Django 6, DRF, Celery. Apps: `accounts`, `companies`,
  `applications`, `documents`, `jobdescriptions`, `ai`, `reminders`, `exports`, `common`.
- `frontend/` — React 19, TypeScript (strict), Vite, Tailwind CSS 4, TanStack Query,
  React Hook Form + Zod, React Router.
- `e2e/` — Playwright journeys run against the Compose stack.
- `docs/` — `PRD.md`, `BUILD_BRIEF.md` (wins on conflicts), `DECISIONS.md`,
  `IMPLEMENTATION_PLAN.md`.

## Development

```bash
# Backend checks (inside the backend container)
docker compose run --rm --no-deps backend sh -c "ruff check . && ruff format --check . && mypy . && pytest"

# Frontend checks (Node 24, see frontend/.nvmrc)
cd frontend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm test

# End-to-end (stack must be running)
cd e2e && npm ci && npx playwright install chromium && npx playwright test
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

## What works so far

- Accounts: register, email verification (Mailpit), sign in/out, password reset, profile and time zone.
- Applications: create (manually, from pasted text, or from an uploaded PDF/DOCX job description), edit,
  soft delete with 30-day restore, search and filters; Kanban (drag and drop or keyboard), table and
  calendar views; every status change is recorded on the timeline.
- Document Library: upload PDF/DOCX (PNG/JPG for certificates and portfolios), immutable versions,
  version history, where each version is used, PDF.js and image preview, archive.
- Application record: Overview, Job Description (original text and file kept unchanged), Documents
  (exact versions; frozen automatically on the first move to Applied; later files labelled
  "Added after submission"), Questions & Answers, Timeline, record completeness.

- AI (fake provider by default): one-time notice, job description extraction with verified quotes,
  side-by-side review that updates the application only on approval, interview practice questions
  from the saved record with the required disclaimer, retry on failure, per-user daily limit.
- Reminders: create/edit/complete/cancel, quick follow-ups, in-app notifications (bell) and email
  (Mailpit), Beat dispatch every minute, "record what happened" after a follow-up.

## AI configuration

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `fake` (default, deterministic, no key) or `openai_compatible` |
| `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL` | Any OpenAI-compatible Chat Completions endpoint |
| `AI_DAILY_LIMIT` | AI requests per user per day (default 25) |

With `openai_compatible` but no key, the fake provider is used. Prompts never include names,
emails or phone numbers; CV contact details are removed before sending.

## Security model (summary)

- Session authentication with HttpOnly, SameSite=Lax cookies and CSRF tokens; no
  tokens in browser storage.
- Every user-owned query is scoped to the signed-in user; other users' records
  return 404. `tests/test_cross_user_access.py` checks every endpoint.
- Rate limits on sign-in (5 per 15 minutes per IP and email), registration,
  password reset, uploads and AI.
- Files live in a private bucket. Downloads go through an ownership check that returns a presigned
  URL valid for at most 5 minutes; storage keys are opaque (see `docs/DECISIONS.md` D-019).
- Uploads are checked by content and extension, limited to 10 MB; legacy `.doc` is rejected.
