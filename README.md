# ApplyVault

**Your job search, organized.** ApplyVault gives every job application its own
permanent record: the original job description, the exact files you submitted,
what happened afterwards, reminders, and AI-assisted interview preparation.

> Status: Phase 1 (Foundation) complete. See `docs/IMPLEMENTATION_PLAN.md`.

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

## Security model (summary)

- Session authentication with HttpOnly, SameSite=Lax cookies and CSRF tokens; no
  tokens in browser storage.
- Every user-owned query is scoped to the signed-in user; other users' records
  return 404. `tests/test_cross_user_access.py` checks every endpoint.
- Rate limits on sign-in (5 per 15 minutes per IP and email), registration,
  password reset, uploads and AI.
