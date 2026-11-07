# Security review

Reviewed at the end of Phase 4. Each item lists how it is enforced and how it is
tested.

| Area | Enforcement | Evidence |
|---|---|---|
| Authentication | Django sessions; HttpOnly, `SameSite=Lax`, `Secure` in production; session key rotated on login; password changes invalidate other sessions | `test_auth.py` (cookie flags, logout, change password) |
| CSRF | DRF `SessionAuthentication` enforces CSRF on unsafe methods; the SPA echoes the CSRF cookie in `X-CSRFToken`; no tokens in JS storage | `test_csrf_is_enforced_for_session_requests`, `auth.test.tsx` checks `localStorage` stays empty |
| Authorization | Every user-owned queryset filters by the requester (directly or through an owned parent); other users' records return 404; related IDs in bodies (company, application, document version) are ownership-checked → 400 | `tests/test_cross_user_access.py`: read/update/delete/download on every resource, plus list endpoints |
| Rate limiting | Sign-in 5/15 min per IP+email; registration, password reset, uploads, AI (burst + daily limit), exports | `test_login_is_rate_limited`, `test_upload_is_rate_limited`, `test_daily_limit_is_friendly` |
| Files | Private bucket; opaque server-generated keys; presigned GETs ≤ 5 minutes from authorized endpoints; content + extension checks; 10 MB cap; `.doc` rejected; sanitized display names | `test_validation.py`, `test_library.py`, `test_s3_storage.py` |
| Immutability | Model-layer guards on `DocumentVersion`, frozen `ApplicationDocument` and the original job description; 409 from the API | `test_immutability.py`, `test_freeze.py`, `test_job_description.py` |
| AI safety | Untrusted text delimited with neutralised markers; instructions inside are ignored by policy; output schema-validated; unsupported values discarded by quote checks; CV contact details removed before sending | `test_injection.py`, `test_quotes_and_deadlines.py`, `test_interview_prep.py` |
| Privacy in logs | Structured logs carry IDs, codes and durations only; no document text, prompts or responses | `test_logs_never_contain_document_text`; grep of all `log.*` calls |
| Data rights | Export ZIP behind an expiring authorized link; account deletion removes all rows and stored files via a retrying job | `test_exports.py`, `test_account_deletion.py`, `e2e/tests/data-rights.spec.ts` |
| Transport & headers | HTTPS redirect, HSTS, `nosniff`, `X-Frame-Options: DENY`, strict CSP from nginx, `Referrer-Policy: same-origin` | `manage.py check --deploy` (only the opt-in HSTS-preload warning remains) |
| Secrets | All secrets from environment variables; production refuses to start without them; `.env*` ignored by git except the examples | `config/settings/prod.py` |

## Queryset audit

`grep` for `objects.all()` in application code returns nothing outside the
admin. Every `objects.filter(...)`/`get(...)` in views either filters by
`owner=request_user(...)`, by an owned parent (`application=`, `document__owner=`,
`application__owner=`), or is the password-reset email lookup, which reveals
nothing (same 204 response either way).

## Known limitations

- Django's admin is enabled for staff (user accounts only, no content models).
- Malware scanning of uploads is out of scope; files are only ever served back
  to their owner with `Content-Disposition` and `nosniff`.
- The dev compose file uses well-known local credentials; never expose it to a
  network you don't trust.
