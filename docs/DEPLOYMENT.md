# Deploying KaziTrail

KaziTrail runs as five processes plus managed services:

| Process | Image | Command |
|---|---|---|
| `frontend` | `frontend/Dockerfile.prod` (nginx) | serves the SPA, proxies `/api` to `backend`, sets security headers |
| `backend` | `backend/Dockerfile.prod` | gunicorn (`config.wsgi`); migrates on start when `RUN_MIGRATIONS=1` |
| `worker` | same backend image | `celery -A config worker` (AI, email, exports, deletion) |
| `beat` | same backend image | `celery -A config beat` (reminders every minute, daily purge) — run exactly one |
| `postgres`, `redis` | managed services recommended | PostgreSQL 16+ (tested on 18), Redis 7+ |

External services: an S3-compatible **private** bucket, an SMTP provider, and
optionally an OpenAI-compatible LLM endpoint.

## Quick start with Docker Compose

```bash
cp .env.production.example .env.production   # fill in every value
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The frontend listens on `HTTP_PORT` (default 8080). Put a TLS-terminating
reverse proxy or load balancer in front of it and forward
`X-Forwarded-Proto: https`. Django redirects plain HTTP (`SECURE_SSL_REDIRECT`),
sets HSTS, and marks cookies `Secure`.

## Required configuration

The backend refuses to start (`ImproperlyConfigured`) if any of these are
missing: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`,
`REDIS_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`FRONTEND_URL`, `CSRF_TRUSTED_ORIGINS`. See `.env.production.example` for the
full list with comments.

## Object storage

1. Create a bucket and block all public access.
2. Create credentials limited to `s3:GetObject`, `s3:PutObject`,
   `s3:DeleteObject` and `s3:ListBucket` on that bucket.
3. Allow CORS `GET` from your app's origin (PDF previews are fetched by the
   browser with presigned URLs):

   ```json
   [{"AllowedOrigins": ["https://kazitrail.example.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 300}]
   ```
4. Set `STORAGE_ORIGIN` to the bucket's public origin so the frontend's
   Content-Security-Policy allows it.

Presigned download URLs expire after `PRESIGNED_URL_TTL_SECONDS` (capped at 300).
For non-AWS providers set `S3_ENDPOINT_URL` (in-network) and
`S3_PUBLIC_ENDPOINT_URL` (what browsers reach), if they differ.

## Email

Set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
`EMAIL_USE_TLS` and `DEFAULT_FROM_EMAIL`. Verification, password reset and
reminder emails are plain text. Reminder emails retry with backoff on failure
and never create duplicate notifications.

## AI

`LLM_PROVIDER=openai_compatible` with `LLM_API_BASE`, `LLM_API_KEY` and
`LLM_MODEL`. Without a key the deterministic fake provider is used (useful for
staging). Tune `AI_DAILY_LIMIT` and `THROTTLE_AI`.

## Operations

- **Migrations** run automatically on backend start (`RUN_MIGRATIONS=1`). Run a
  single backend replica during deploys that include migrations, or run
  `python manage.py migrate` as a release step and set `RUN_MIGRATIONS=0`.
- **Scaling:** `backend` and `worker` scale horizontally. Reminder dispatch uses
  `SELECT … FOR UPDATE SKIP LOCKED`, so several workers never double-send.
  Run exactly one `beat`.
- **Health check:** `GET /api/v1/health` (exempt from the HTTPS redirect).
- **Logs** are JSON on stdout with a `request_id` on every line. They never
  contain CV or job description text, prompts, AI responses or file contents.
- **Backups:** back up PostgreSQL and enable versioning or replication on the
  bucket. Restoring needs both: database rows reference storage keys.
- **Retention jobs** (Beat): purge applications deleted more than 30 days ago
  and unreferenced files (03:15 UTC), purge expired exports (03:45 UTC).
- **Admin:** `/admin/` exposes only user accounts (no application content). Create
  a staff user with `python manage.py createsuperuser`.
- **HSTS preload** is not enabled by default (`SECURE_HSTS_PRELOAD`); opt in once
  every subdomain serves HTTPS.

## Verifying a deployment

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py check --deploy
curl -fsS https://kazitrail.example.com/api/v1/health
cd e2e && BASE_URL=https://kazitrail.example.com npx playwright test tests/foundation.spec.ts
```
