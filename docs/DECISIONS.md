# Decisions

Each entry records a choice the source documents left open or settled in
conflicting ways. `BRIEF` = `docs/BUILD_BRIEF.md`, `PRD` = `docs/PRD.md`.
The brief wins wherever the two conflict.

## D-001 Source of truth and conflict resolution

The PRD arrived after the brief, as a separate "master build prompt". The brief
states that it wins over the PRD on any conflict, so it does. Conflicts resolved
in favour of the brief:

| Topic | PRD | Decision (BRIEF) |
|---|---|---|
| Auth | SimpleJWT access/refresh tokens | Django session auth, HttpOnly + SameSite cookies, CSRF. No tokens in JS storage. |
| Versions | React 18, Django 5 | Current stable: React 19, Django 6, Vite 8, Tailwind 4. TypeScript 6.0 (typescript-eslint does not yet support TS 7). |
| Submission freeze | Manual "Finalize submitted documents" button | Attachments freeze automatically the first time the application moves to Applied. No separate finalize button. |
| Deadline extraction | `YYYY-MM-DD` from the model | Deadline stored as written with a supporting quote; parsed on the server only when unambiguous and includes the year. |
| Extraction fields | Values only | Every value carries an exact supporting quote, verified on the server. Adds eligibility criteria. |
| Accepted files | pdf, docx, doc, png, jpg, txt | PDF + DOCX everywhere; PNG/JPG for certificates and portfolios only; `.doc` rejected with a clear message; no txt. |
| Presigned URL expiry | 60 seconds | 300 seconds (brief allows up to 5 minutes; PDF.js preview needs range requests over a few seconds). |
| Hard delete | Account deletion immediate cascade | Account deletion via a retrying Celery job after password confirmation. Applications are soft-deleted with 30-day restore. |
| Interview prep sections | company_questions | role-specific questions instead; the model may not claim company facts absent from saved material. |
| Disclaimer text | "AI-generated practice material…" | "AI-generated practice questions. These are not actual questions from the employer." |
| AI rate limit | 20/hour/user | Configurable per-user **daily** limit (`AI_DAILY_LIMIT`, default 25), plus a burst throttle. |
| Async job polling | Separate Job model + `GET /jobs/:id` | Status lives on the record itself (`JobDescription.extraction_status`, `InterviewPreparation.status`): queued, processing, succeeded, failed. The client polls the record. |
| Sidebar | Dashboard, Applications, Documents, Reminders, Settings | Dashboard, My Applications, Document Library, Calendar & Reminders, Analytics, Settings. |
| Detail tabs | No Q&A | Adds Questions & Answers tab. |

PRD items kept because the brief does not contradict them: the consistent error
envelope `{"error": {"code", "message", "details"}}`, page-number pagination
(default 25), structlog JSON logs with request IDs, `seed_demo` command with
`demo@applyvault.dev`, native HTML5 drag and drop (no DnD library), Zod form
validation, confirmation dialogs for destructive actions, responsive down to
375px.

## D-002 Functional requirements FR-01 to FR-10

The PRD does not number its requirements, so they are defined here. Each maps
to tests listed in `docs/IMPLEMENTATION_PLAN.md` (Test matrix).

| ID | Requirement |
|---|---|
| FR-01 | Accounts: register, verify email, log in/out, password reset, profile and timezone, session auth with CSRF. |
| FR-02 | Applications: create, edit, soft delete with 30-day restore, search and filter; every status change creates a system timeline activity. |
| FR-03 | Dashboard summary and the Kanban, table and calendar views, with the view persisted in the URL. |
| FR-04 | Job description record: paste or upload; original text and file preserved unchanged; no-text files ask for pasted text. |
| FR-05 | AI extraction with quotes verified against the source, unsupported values discarded and shown as "Not specified", deadline rule, side-by-side review before application fields change. |
| FR-06 | Document library: immutable versions, new storage key per upload, archive instead of delete, private storage with ≤5-minute presigned downloads, file validation. |
| FR-07 | Submission snapshots: freeze on first move to Applied, 409 on edit/remove of frozen rows, no unfreeze on regression, "Added after submission" labelling. |
| FR-08 | Questions & answers, timeline activities and notes. |
| FR-09 | Reminders and notifications: UTC storage, Beat dispatch with row locking, in-app + email, email retry without duplicate notification. |
| FR-10 | AI interview preparation from the saved record, missing-input reporting, disclaimer, saved generations with editable notes. |

Analytics, export and account deletion are covered by tests too, under
"Launch readiness" in the test matrix.

## D-003 Email verification does not block use

Unverified users can sign in and use the app; a banner asks them to verify.
Reminder **emails** are only sent to verified addresses (in-app notifications
always fire). This keeps the first-run journey short while ensuring we never
email an address nobody confirmed.

## D-004 Status freeze trigger

The freeze happens on the first transition into Applied, tracked by
`Application.submitted_at`. Moving directly from Saved to Interview (skipping
Applied) does not freeze; the user is told attachments are frozen only via
Applied. Moving back and forth never unfreezes. `date_applied` is set to the
user's local date if blank.

## D-005 Job description is write-once

`original_text` and the original file are write-once. The single exception: when
an uploaded file has no extractable text, the user may supply pasted text once
(recorded as `text_source = "paste_supplement"`). A job description cannot be
replaced after it is saved; this is what makes the record trustworthy.

## D-006 Raw AI output vs reviewed data

`JobDescription.raw_ai_output` stores `{model, prompt_version, output,
discarded}` where `output` is the schema-validated model response after quote
verification (unsupported values replaced with null) and `discarded` lists what
was dropped and why. `reviewed_data` is only written when the user approves the
review. The UI labels these "AI suggestion" and "Your reviewed version".

## D-007 Deadline parsing

A deadline is parsed to a date only for unambiguous formats that include a year:
ISO `2026-03-15`, `15 March 2026`, `15th March 2026`, `March 15, 2026`,
`Mar 15 2026`. Numeric slash/dot dates (`03/04/2026`) are treated as ambiguous
and never parsed. Weekday names, relative dates ("in two weeks") and dates
without years are not parsed.

## D-008 Delete semantics and file cleanup

- Application delete sets `deleted_at`. Restore is allowed for 30 days.
- A daily Beat task permanently deletes applications whose `deleted_at` is more
  than 30 days old, then deletes stored files no longer referenced.
- A document version is "referenced" if its document is not archived or any
  `ApplicationDocument` points at it. Unreferenced versions of documents that
  were archived more than 30 days ago are removed by the same job.
- Archiving is not reversible in this release.
- FKs from `ApplicationDocument` to `DocumentVersion` and from `Application` to
  `Company` use `RESTRICT`, which blocks ad-hoc deletion but allows account
  deletion's cascade.

## D-009 Storage access

Storage is accessed through a small service (`apps.common.storage`) built on
boto3 rather than `django-storages` FileFields, so storage keys stay server-only
and we control presigning (separate public endpoint for presigned URLs so the
browser can reach MinIO). Tests use an in-memory implementation of the same
interface.

## D-010 Kanban page size

The Kanban and calendar views fetch up to 200 applications in one page
(`page_size=200` is the server maximum). Typical job searches are well under
this; beyond it the board shows a notice and links to the table view.

## D-011 Reminders always belong to an application

A reminder must reference an application owned by the user. Notifications for
export completion are created without a reminder.

## D-012 Interview prep availability

Interview prep can be generated when the status is Interview or any later
status in the order (Offer, Rejected, Withdrawn).

## D-013 LLM provider

`LLM_PROVIDER=fake` (default) or `openai_compatible` (`LLM_API_BASE`,
`LLM_API_KEY`, `LLM_MODEL`). When `openai_compatible` is chosen but no key is
set, the fake provider is used. The fake provider is a deterministic rule-based
extractor that quotes the source text, so the demo is meaningful without a key.
Pydantic models define the strict output schemas.

## D-014 Text extraction library

`pypdf` instead of `pdfplumber` for PDF text (pure Python, smaller image,
adequate for text-layer PDFs; OCR is out of scope). `python-docx` for DOCX.

## D-015 Dashboard definitions

- **In progress** = Preparing + Applied + Assessment (as in the PRD).
- **Interviewing** = applications whose status is Interview. (The brief's
  "interviews scheduled" is shown as upcoming interview reminders in the
  reminders list; the tile counts applications at the interview stage, which is
  always accurate even when no reminder was set.)
- **Follow-ups due** = open follow-up reminders due in the next 7 days or overdue.

## D-016 Record completeness rules

Three items, each worth a third:
1. Job description: a saved job description with text or an original file.
2. Submitted documents: at least one frozen attachment.
3. Application history: at least one status change or user-recorded activity.
   System entries such as "created" or "job description saved" don't count.

## D-017 Local infrastructure

- The `minio/minio` Docker Hub image is no longer published, so local storage
  uses `cgr.dev/chainguard/minio` (current MinIO releases). The backend creates
  the private bucket at startup (`ensure_bucket`), so no `mc` container is needed.
- Postgres and the backend publish no host ports (they commonly collide with
  other local projects). The frontend dev server proxies `/api`, so the API and
  its docs are at `http://localhost:5173/api/v1/…`.
- Django 6.1 deprecates `EMAIL_*` settings; email is configured with `MAILERS`
  from the same environment variables.

## D-018 First move to Applied is confirmed in the UI

Because the move freezes files, the UI always confirms the first move to
Applied (from any view) and shows the no-CV warning inside that confirmation.
The API itself never blocks: it returns `warnings: ["no_cv"]`.

## D-019 Opaque storage keys

A presigned URL necessarily contains the object key. Keys are therefore opaque:
`u/<HMAC(SECRET_KEY, user id)[:32]>/<random hex>`. They reveal no user ID,
filename or document type, and are never returned by the API on their own.
Account deletion removes every key recorded in the database and then anything
left under the user's prefix.

## D-020 Starting an application from a job description

Starting from a pasted or uploaded job description still asks for the job title
and company (two short fields), because an application needs them. The
application is saved first and the job description second, so a failed upload
never loses what the user typed; AI extraction can then refine the fields after
review.

## D-021 Inline uploads and the library

Files uploaded from an application's Documents tab create a document with
`is_master = false` unless the user ticks "Also keep it in my Document Library".
Such documents are hidden from the library by default and are removed by the
purge job once no application references them.

## D-022 Local rate limits

`.env.example` sets `THROTTLE_REGISTER=200/h` so end-to-end runs can create many
accounts from one IP. Production uses the code default (10/h) unless configured.

## D-023 AI pipeline details

- Prompts wrap each untrusted block in `<<<NAME_START>>> … <<<NAME_END>>>` and
  neutralise marker look-alikes inside the content (`<<<` → `‹‹‹`), so a
  document cannot close its own block. The system prompt says to ignore any
  instructions inside the blocks.
- Output is validated with Pydantic (`extra="forbid"`). On invalid output the
  request is repeated once with a stricter instruction; a second failure marks
  the job `failed` with code `invalid_output`. Provider/network errors give
  `provider_unavailable`. Failures only change the job status.
- Quote verification compares whitespace-normalised quotes against the
  whitespace-normalised source, case-sensitively. Unsupported values are
  replaced with null and listed in `raw_ai_output.discarded`.
- Budgets: job description ≤ 48,000 characters, CV ≤ 24,000 characters
  (≈ 12k/6k tokens, as the PRD suggests); truncation is recorded.
- The daily AI limit counts requests since local midnight in the user's time
  zone (`AI_DAILY_LIMIT`, default 25). A per-hour burst throttle also applies.
- CV and cover letter text is extracted on demand for each interview-prep run
  and never stored.
- On review approval, non-empty reviewed values overwrite the matching
  application fields (title, company, location, employment type, work
  arrangement, compensation, deadline). Empty values leave fields unchanged.

## D-024 Reminder rescheduling

Editing the time of a reminder that was already sent makes it pending again and
removes its old notification, so it is delivered once at the new time.
Completed and cancelled reminders cannot be edited (409). Completing a non
follow-up reminder records a timeline entry; completing a follow-up asks the
user to record what happened instead.
