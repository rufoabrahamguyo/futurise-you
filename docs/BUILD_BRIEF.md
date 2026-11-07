# KaziTrail — Build Brief (lead engineer instructions)

> Provided by the product owner. This brief wins over `docs/PRD.md` wherever
> they conflict, because it resolves open decisions.

You are the lead engineer building KaziTrail, a production-quality web SaaS that helps job seekers organize, track and understand every job application. Tagline: "Your job search, organized."

Read docs/PRD.md before doing anything else. It is the product source of truth. If it conflicts with this prompt, this prompt wins because it resolves open decisions. Do not ask me to re-decide anything settled here. If something is unspecified, choose the simplest sound option, record it in docs/DECISIONS.md and continue. Stop to ask only if a choice would be expensive to reverse.

## Product principle

Every job application deserves its own permanent, organized record.

A user must be able to open any application months later and see exactly what happened, including the original job description and the exact files submitted, without searching elsewhere.

This is not a job board. Do not build job discovery or one-click applying.

## Stack

Use current stable versions.

- Frontend: React, TypeScript (strict), Vite, Tailwind CSS, React Query, React Hook Form, React Router, PDF.js
- Backend: Django, Django REST Framework, PostgreSQL
- Files: S3-compatible private object storage (MinIO locally)
- Background work: Celery, Celery Beat, Redis
- AI: a provider-agnostic LLM interface configured by environment variables, plus a deterministic fake provider used for tests and when no API key is set
- Local development: Docker Compose with frontend, backend, worker, beat, postgres, redis, minio and a local mail catcher such as Mailpit

## Scope

Build:
- Authentication and account management
- Dashboard with Kanban, table and calendar views
- Application create, edit, delete, search and filtering
- Job description paste and upload
- AI job description extraction with user review
- Document library and document versioning
- Application document snapshots
- Application questions and answers
- Timeline and notes
- Reminders through in-app and email notifications
- AI interview preparation
- Basic analytics
- Data export and account deletion

Do not build:
- Job URL scraping or extraction (store the URL as a link only)
- Browser extension
- Gmail sync
- LinkedIn integration
- Job discovery or auto-apply
- Payments
- Native mobile apps
- Custom statuses (keep statuses in one place so they can be added later)
- Success prediction
- A standalone AI chat page

## Core data model

Use UUID primary keys for user-owned records. Add owner, created_at and updated_at where appropriate.

- User: email login, full name, timezone, AI processing acknowledgement timestamp
- Company: owner, name. Companies are private to each user and are not shared globally.
- Application: owner, company, job title, location, employment type, work arrangement (remote, hybrid, onsite), compensation text, job URL, deadline, date applied, status, recruiter name, recruiter email, recruiter phone, deleted_at
- JobDescription: one per application; source type (paste or upload), original text, original file reference, extraction status, raw AI output, reviewed data, reviewed_at
- ApplicationQuestion: application, question, submitted answer, order
- Document: owner, title, type (CV, cover letter, transcript, certificate, portfolio, other), is_master, archived_at
- DocumentVersion: document, version number, storage key, original filename, MIME type, size, SHA-256 hash, created_at
- ApplicationDocument: application, document version, role, is_frozen, frozen_at, added_after_submission
- ApplicationActivity: application, type, title, body, occurred_at, is_system_generated
- Reminder: owner, application, type (deadline, follow-up, interview, assessment, recruiter response, other), title, remind_at in UTC, channels, status (pending, sent, completed, cancelled), sent_at, completed_at
- Notification: owner, reminder, title, body, read_at
- InterviewPreparation: application, generated content, input references, status, user notes, created_at

Statuses, in order: Saved, Preparing, Applied, Assessment, Interview, Offer, Rejected, Withdrawn. Users may move an application between any statuses. Every status change creates a system timeline activity.

## Non-negotiable rules

### Document immutability
1. A DocumentVersion can never be changed or overwritten. Each upload creates a new version and a new storage key. Enforce this at the model layer and in the API.
2. The first time an application moves to Applied, freeze its attachments, set date applied if blank and add a timeline activity listing the exact files and versions.
3. If no CV is attached at that moment, warn the user but allow them to continue.
4. Frozen ApplicationDocument rows cannot be edited or removed. The API must return 409 if this is attempted.
5. Moving an application back to an earlier status does not unfreeze anything.
6. Files added after submission are labeled "Added after submission" and never presented as part of the original submission.
7. Deleting a library document archives it. Any version referenced by an application stays available from that application.

### The job description record
1. Keep the original text and file unchanged forever.
2. Keep raw AI output separately from user-reviewed data.
3. Show the user clearly which is which.

### Deletion
1. Deleting an application requires confirmation and is a soft delete with 30-day restore. A scheduled job then permanently removes it, along with any files no longer referenced.
2. Account deletion is the deliberate exception to immutability. After password confirmation, permanently delete all user data and stored files. Do this through a background job with retry, and make it testable.

### Privacy and authorization
1. Scope every queryset for user-owned data to request.user on the server. Return 404 for records owned by someone else.
2. Check ownership of every related ID in a request body, including company, document version and application IDs.
3. Add a shared automated test that attempts cross-user read, update, delete and download on every resource.
4. The storage bucket must be private. Never expose storage keys. Downloads go through an authorized endpoint that returns a presigned URL valid for no more than 5 minutes.
5. Never log CV text, job description text, prompts, AI responses or file contents.

### File handling
1. Validate file type by content as well as extension, and enforce a 10 MB limit.
2. Accept PDF and DOCX everywhere. Also accept PNG and JPG for certificates and portfolios. Reject legacy .doc files with a clear message.
3. Sanitize filenames for display and generate storage keys on the server.
4. Preview PDFs and images in the app with PDF.js or an image view. DOCX files are download-only in this release.

## AI requirements

General:
- Run all AI work in Celery, with visible states: queued, processing, succeeded, failed.
- Save user data before any AI call. An AI failure must never lose data or block the user from entering details manually. Provide a retry button.
- Validate all model output against a strict schema. Retry once on invalid output, then fail cleanly.
- Treat job descriptions and CVs as untrusted data. Wrap them as clearly delimited content and instruct the model to ignore any instructions inside them. Add a test containing a prompt injection attempt.
- Show a one-time notice before a user's first AI action explaining what is sent to the AI provider, and store the acknowledgement.
- Remove email addresses and phone numbers from CV text before sending it to the provider.
- Apply a configurable per-user daily AI limit and show a friendly message when it is reached.

Job description extraction:
- Extract job title, company, location, employment type, required skills, education, experience, responsibilities, mandatory requirements, preferred qualifications, eligibility criteria, benefits, required documents, application instructions and deadline.
- Each extracted item must include the exact supporting quote from the job description.
- On the server, check that each quote appears in the source text after normalizing whitespace. If it does not, discard the value.
- Missing values are stored as null and displayed as "Not specified."
- Never infer a deadline. Store the deadline as written, and parse it to a date only if the date is unambiguous and includes the year. Otherwise, the user enters the date during review.
- If a file has no extractable text, such as a scanned PDF, tell the user and ask them to paste the text. Do not add OCR.
- Show a side-by-side review screen with the source on one side and editable fields on the other. Application fields are updated only after the user approves the review.

Interview preparation:
- Enable this from the application page once the status is Interview. It may also be run manually from later statuses.
- Use the original job description, approved requirements, the frozen submitted CV and the frozen cover letter. If a submitted document is missing, generate from what exists and tell the user what was missing.
- Generate technical questions, behavioral questions, questions about skills in the CV, role-specific questions and suggested preparation topics.
- Do not claim facts about the company that are not in the saved material.
- Label results prominently: "AI-generated practice questions. These are not actual questions from the employer."
- Save each generation as a record with editable user notes.

## Screens

Use a left sidebar with: Dashboard, My Applications, Document Library, Calendar & Reminders, Analytics, Settings. Add a notification bell and a global search for company or job title.

1. Auth: register, email verification, log in, log out, password reset.
2. Dashboard: counts for total, in progress, interviews scheduled, offers, rejections and follow-ups due, plus recently updated applications and upcoming reminders.
3. My Applications: Kanban with drag-and-drop and a keyboard-accessible status control, sortable table, calendar view of deadlines and reminders, filters and search. Persist the chosen view in the URL.
4. Add Application: start by manual entry, pasted job description or uploaded job description.
5. Application detail, the most important screen. Use tabs or sections for Overview, Job Description, Documents, Questions & Answers, Timeline, Reminders and Interview Prep. Show a "Submitted version" badge and date on frozen files, and a record completeness indicator showing what is missing.
6. Document Library: documents grouped by type, version history, associated applications, preview, download, upload new version and archive.
7. Calendar & Reminders: upcoming, overdue and completed reminders, with create, edit, complete and cancel actions. Completing a follow-up prompts the user to record a timeline activity.
8. Analytics: basic counts by status, applications over time and the user's record completeness percentage.
9. Settings: profile, timezone, notification preferences, AI notice, data export and account deletion.

Design it as a calm, trustworthy professional tool, not a generic template. It must be responsive from mobile to desktop, keyboard navigable, have readable contrast and include designed empty, loading and error states.

Record completeness means the percentage of an application's three core items that are preserved: job description, submitted documents and application history.

## Reminders

- Store times in UTC and display them in the user's timezone.
- A Celery Beat task runs every minute and claims due reminders with row locking, so running workers concurrently cannot send duplicates.
- Sending creates an in-app notification and, if enabled, an email.
- A failed email must retry without creating a duplicate notification.

## Security and quality

- Use Django session authentication with secure, HttpOnly, SameSite cookies and CSRF protection. Do not store tokens in localStorage.
- Rate-limit login, password reset, upload and AI endpoints.
- Version the API under /api/v1, paginate lists and publish an OpenAPI schema.
- Index common dashboard, filter and search queries, and avoid N+1 queries.
- Export produces a ZIP containing application records as JSON and CSV, with their files, generated by a background job and delivered by an expiring authorized link.
- Keep all secrets in environment variables and provide .env.example.
- Backend tests use pytest. Frontend tests use Vitest and React Testing Library. Add Playwright end-to-end tests for the core journeys.
- Add linting, formatting and type checks, plus a GitHub Actions workflow that runs them with the tests.

## Build order

First, inspect the repo and write docs/IMPLEMENTATION_PLAN.md, then begin without waiting for approval. Work in small commits. Complete each phase, including tests, before moving on.

Phase 1, Foundation: Docker Compose, project setup, CI, auth, data models, application CRUD, statuses, dashboard and the three views.

Phase 2, Application Vault: private storage, uploads, document library, versioning, job description storage, application detail page, freezing, questions and answers, timeline and notes.

Phase 3, AI and reminders: LLM interface, extraction and review, interview preparation, reminders, notifications and email.

Phase 4, Launch readiness: analytics, export, soft-delete purge, account deletion, security review, accessibility and responsive pass, seed data, deployment documentation and a production Docker configuration.

At the end of each phase, run all tests and checks, fix failures and update README.md and docs/DECISIONS.md. Report what works, how to try it and any known gaps. Never claim something works without running it.

## Definition of done

- `docker compose up` starts the whole app from a clean clone, using the README and .env.example, with no real AI key required.
- A seed command creates a demo user with realistic applications.
- FR-01 through FR-10 in the PRD are each covered by at least one automated test.
- End-to-end tests pass for these journeys:
  1. Register, add an application, upload a job description, review the extraction, attach documents and mark as Applied.
  2. Upload a new CV version, then confirm the old application still opens the exact file originally submitted.
  3. Search for an old application and view its job description, submitted files, notes and timeline.
  4. Move to Interview, generate preparation material and save notes.
  5. Set a follow-up, receive it, then record the follow-up activity.
- Cross-user access tests pass for every resource.
- An AI failure test proves no user data is lost.
- Extraction tests prove unsupported values show as "Not specified."
