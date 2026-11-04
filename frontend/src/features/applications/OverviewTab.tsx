import { useState } from "react";

import { Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type { Application } from "@/lib/types";

import { useUpdateApplication } from "./api";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-500 text-sm">{label}</dt>
      <dd className="text-ink-900 mt-0.5 text-sm sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
  );
}

const notSpecified = <span className="text-ink-400">Not specified</span>;

export function OverviewTab({ app }: { app: Application }) {
  const meta = useMeta();
  const update = useUpdateApplication(app.id);
  const toast = useToast();
  // null while not editing, so the saved value from the server is shown.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const notes = draft ?? app.notes;

  function saveNotes() {
    if (draft === null || draft === app.notes) {
      setDraft(null);
      return;
    }
    update.mutate(
      { notes: draft },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
        // Keep the draft so nothing typed is lost; blurring again retries.
        onError: (e) => toast.show(`Notes not saved: ${errorMessage(e)}`, "error"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="card px-5 py-2 lg:col-span-3" aria-labelledby="details-heading">
        <h2 id="details-heading" className="sr-only">
          Details
        </h2>
        <dl className="divide-line divide-y">
          <Row label="Location">{app.location || notSpecified}</Row>
          <Row label="Employment type">
            {app.employment_type
              ? labelFor(meta.data?.employment_types, app.employment_type)
              : notSpecified}
          </Row>
          <Row label="Work arrangement">
            {app.work_arrangement
              ? labelFor(meta.data?.work_arrangements, app.work_arrangement)
              : notSpecified}
          </Row>
          <Row label="Compensation">{app.compensation || notSpecified}</Row>
          <Row label="Deadline">{app.deadline ? formatDate(app.deadline) : notSpecified}</Row>
          <Row label="Date applied">
            {app.date_applied ? (
              formatDate(app.date_applied)
            ) : (
              <span className="text-ink-400">Not yet applied</span>
            )}
          </Row>
          <Row label="Job listing">
            {app.job_url ? (
              <a
                href={app.job_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-pine-700 inline-flex items-center gap-1 break-all hover:underline"
              >
                <Icon name="link" className="size-3.5 shrink-0" />
                {app.job_url}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              notSpecified
            )}
          </Row>
          <Row label="Recruiter">
            {app.recruiter_name || app.recruiter_email || app.recruiter_phone ? (
              <span className="flex flex-col gap-0.5">
                {app.recruiter_name ? <span>{app.recruiter_name}</span> : null}
                {app.recruiter_email ? (
                  <a
                    className="text-pine-700 hover:underline"
                    href={`mailto:${app.recruiter_email}`}
                  >
                    {app.recruiter_email}
                  </a>
                ) : null}
                {app.recruiter_phone ? (
                  <a className="text-pine-700 hover:underline" href={`tel:${app.recruiter_phone}`}>
                    {app.recruiter_phone}
                  </a>
                ) : null}
              </span>
            ) : (
              notSpecified
            )}
          </Row>
        </dl>
      </section>
      <section className="card p-5 lg:col-span-2" aria-labelledby="notes-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="notes-heading" className="font-sans text-sm font-semibold tracking-normal">
            <label htmlFor="app-notes">Notes</label>
          </h2>
          <span className="text-ink-500 text-xs" aria-live="polite">
            {update.isPending
              ? "Saving…"
              : update.isError
                ? "Not saved — click away to retry"
                : saved
                  ? "Saved"
                  : "Saves when you click away"}
          </span>
        </div>
        <Textarea
          id="app-notes"
          rows={10}
          value={notes}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNotes}
          placeholder="Anything worth remembering about this role."
        />
      </section>
    </div>
  );
}
