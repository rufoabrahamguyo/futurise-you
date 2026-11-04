import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Notice } from "@/components/Feedback";
import { Field, FormError, Input, Select, Textarea } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { aiErrorMessage, useAINotice } from "@/features/ai/AINotice";
import { useCurrentUser } from "@/features/auth/hooks";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type {
  Application,
  Choice,
  Extraction,
  JobDescription,
  Quoted,
  ReviewedData,
} from "@/lib/types";

import { jdKey } from "./api";

export const NOT_SPECIFIED = "Not specified";

type ScalarKey = "job_title" | "company" | "location" | "compensation";
type ListKey = Exclude<
  keyof ReviewedData,
  ScalarKey | "employment_type" | "work_arrangement" | "deadline" | "deadline_text"
>;

const SCALARS: { key: ScalarKey; label: string }[] = [
  { key: "job_title", label: "Job title" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "compensation", label: "Compensation" },
];

export const LISTS: { key: ListKey; label: string }[] = [
  { key: "mandatory_requirements", label: "Mandatory requirements" },
  { key: "preferred_qualifications", label: "Preferred qualifications" },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "required_skills", label: "Required skills" },
  { key: "experience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "eligibility_criteria", label: "Eligibility criteria" },
  { key: "benefits", label: "Benefits" },
  { key: "required_documents", label: "Required documents" },
  { key: "application_instructions", label: "Application instructions" },
];

const CHOICE_HINTS: Record<string, RegExp> = {
  full_time: /full[\s-]?time|permanent/i,
  part_time: /part[\s-]?time/i,
  contract: /contract|freelance|fixed[\s-]?term/i,
  internship: /intern/i,
  temporary: /temp/i,
  remote: /remote/i,
  hybrid: /hybrid/i,
  onsite: /on[\s-]?site|in[\s-]?office|office[\s-]?based/i,
};

/** Maps free text like "Full-time (permanent)" to a choice value, if one clearly matches. */
export function guessChoice(text: string | undefined, choices: Choice[]): string {
  if (!text) return "";
  return choices.find((c) => CHOICE_HINTS[c.value]?.test(text))?.value ?? "";
}

function initialReview(
  jd: JobDescription,
  app: Application,
  meta: { employment_types: Choice[]; work_arrangements: Choice[] },
): ReviewedData {
  if (jd.reviewed_data) return jd.reviewed_data;
  const ai: Partial<Extraction> = jd.raw_ai_output?.output ?? {};
  const value = (q: Quoted | null | undefined) => q?.value ?? null;
  const list = (items: Quoted[] | undefined) => (items ?? []).map((i) => i.value);
  return {
    job_title: value(ai.job_title) ?? app.job_title,
    company: value(ai.company) ?? app.company.name,
    location: value(ai.location),
    employment_type: guessChoice(ai.employment_type?.value, meta.employment_types) || null,
    work_arrangement: guessChoice(ai.work_arrangement?.value, meta.work_arrangements) || null,
    compensation: value(ai.compensation),
    deadline_text: ai.deadline?.value ?? null,
    deadline: ai.deadline?.parsed_date ?? null,
    required_skills: list(ai.required_skills),
    education: list(ai.education),
    experience: list(ai.experience),
    responsibilities: list(ai.responsibilities),
    mandatory_requirements: list(ai.mandatory_requirements),
    preferred_qualifications: list(ai.preferred_qualifications),
    eligibility_criteria: list(ai.eligibility_criteria),
    benefits: list(ai.benefits),
    required_documents: list(ai.required_documents),
    application_instructions: list(ai.application_instructions),
  };
}

export function ExtractionPanel({ app, jd }: { app: Application; jd: JobDescription }) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { withNotice } = useAINotice();
  const [reviewing, setReviewing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const extract = useMutation({
    mutationFn: () => api.post<JobDescription>(`/applications/${app.id}/job-description/extract`),
    onSuccess: (data) => qc.setQueryData(jdKey(app.id), data),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const run = () => withNotice(() => extract.mutate());

  if (!jd.has_text) return null;
  const status = jd.extraction_status;

  return (
    <section
      className="card p-5"
      aria-labelledby="extraction-heading"
      aria-busy={status === "queued" || status === "processing"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="extraction-heading" className="font-sans text-base font-semibold tracking-normal">
            {jd.reviewed_data ? "Your reviewed version" : "Details from the job description"}
          </h2>
          <p className="text-ink-500 mt-0.5 text-sm">
            {jd.reviewed_data && jd.reviewed_at
              ? `Approved by you ${formatDateTime(jd.reviewed_at, user.timezone)}. The AI suggestion is kept separately.`
              : "AI can read the job description and suggest the key details. You review everything before your record changes."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === "not_started" ? (
            <Button variant="primary" icon="sparkles" loading={extract.isPending} onClick={run}>
              Extract details with AI
            </Button>
          ) : null}
          {status === "succeeded" ? (
            <Button
              variant={jd.reviewed_data ? "secondary" : "primary"}
              icon="pencil"
              onClick={() => setReviewing(true)}
            >
              {jd.reviewed_data ? "Edit review" : "Review extracted details"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {status === "queued" || status === "processing" ? (
          <p className="text-ink-700 flex items-center gap-2 text-sm">
            <Spinner className="text-pine-700 size-4" />
            {status === "queued" ? "Queued — starting shortly…" : "Reading the job description…"}
          </p>
        ) : null}
        {status === "failed" ? (
          <Notice
            tone="danger"
            title="Extraction didn't finish"
            action={
              <Button size="sm" icon="refresh" loading={extract.isPending} onClick={run}>
                Retry
              </Button>
            }
          >
            {aiErrorMessage(jd.extraction_error)} Your job description and details are safe. You can
            retry, or enter the details yourself with “Edit details”.
          </Notice>
        ) : null}
        {status === "succeeded" && !jd.reviewed_data ? (
          <Notice
            tone="info"
            title="AI-extracted. Review and correct anything before relying on it."
          >
            Nothing has changed on your application yet.
          </Notice>
        ) : null}
      </div>

      {jd.reviewed_data ? (
        <>
          <StructuredView data={jd.reviewed_data} />
          {jd.raw_ai_output ? (
            <div className="border-line mt-4 border-t pt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAI((v) => !v)}
                aria-expanded={showAI}
              >
                {showAI
                  ? "Hide the original AI suggestion"
                  : "Compare with the original AI suggestion"}
              </Button>
              {showAI ? <AISuggestionView output={jd.raw_ai_output.output} /> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {reviewing ? (
        <ExtractionReview app={app} jd={jd} onClose={() => setReviewing(false)} />
      ) : null}
    </section>
  );
}

function ValueList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-ink-400 text-sm">{NOT_SPECIFIED}</p>;
  return (
    <ul className="text-ink-900 list-disc space-y-1 pl-5 text-sm">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function StructuredView({ data }: { data: ReviewedData }) {
  const meta = useMeta();
  const scalars: [string, string | null][] = [
    ["Job title", data.job_title],
    ["Company", data.company],
    ["Location", data.location],
    [
      "Employment type",
      data.employment_type ? labelFor(meta.data?.employment_types, data.employment_type) : null,
    ],
    [
      "Work arrangement",
      data.work_arrangement ? labelFor(meta.data?.work_arrangements, data.work_arrangement) : null,
    ],
    ["Compensation", data.compensation],
    [
      "Deadline",
      data.deadline
        ? `${formatDate(data.deadline)}${data.deadline_text ? ` (“${data.deadline_text}”)` : ""}`
        : data.deadline_text,
    ],
  ];
  return (
    <div className="mt-5 space-y-6">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {scalars.map(([label, value]) => (
          <div key={label}>
            <dt className="text-ink-500 text-xs">{label}</dt>
            <dd className={`text-sm ${value ? "text-ink-900" : "text-ink-400"}`}>
              {value ?? NOT_SPECIFIED}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 md:grid-cols-2">
        {LISTS.map(({ key, label }) => (
          <section key={key} aria-label={label}>
            <h3 className="text-ink-900 mb-1.5 text-sm font-semibold">{label}</h3>
            <ValueList items={data[key]} />
          </section>
        ))}
      </div>
    </div>
  );
}

function AISuggestionView({ output }: { output: Extraction }) {
  const scalars: [string, Quoted | null][] = [
    ["Job title", output.job_title],
    ["Company", output.company],
    ["Location", output.location],
    ["Employment type", output.employment_type],
    ["Work arrangement", output.work_arrangement],
    ["Compensation", output.compensation],
    ["Deadline (as written)", output.deadline],
  ];
  return (
    <div className="border-line-strong bg-paper/60 mt-3 rounded-lg border border-dashed p-4">
      <Badge tone="violet" icon="sparkles">
        AI suggestion
      </Badge>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {scalars.map(([label, q]) => (
          <div key={label}>
            <dt className="text-ink-500 text-xs">{label}</dt>
            <dd className={`text-sm ${q ? "text-ink-900" : "text-ink-400"}`}>
              {q?.value ?? NOT_SPECIFIED}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {LISTS.map(({ key, label }) => (
          <div key={key}>
            <p className="text-ink-700 text-xs font-semibold">{label}</p>
            <ValueList items={output[key].map((q) => q.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Finds a quote in the source, tolerant of whitespace differences. */
function findQuote(source: string, quote: string): [number, number] | null {
  const pattern = quote
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!pattern) return null;
  const match = new RegExp(pattern).exec(source);
  return match ? [match.index, match.index + match[0].length] : null;
}

function SourcePanel({ text, highlight }: { text: string; highlight: string | null }) {
  const range = highlight ? findQuote(text, highlight) : null;
  return (
    <div
      className="border-line bg-paper/60 text-ink-900 h-full overflow-y-auto rounded-lg border p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
      tabIndex={0}
      aria-label="Original job description"
    >
      {range ? (
        <>
          {text.slice(0, range[0])}
          <mark
            className="text-ink-900 rounded bg-amber-200 px-0.5"
            ref={(el) => {
              el?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
          >
            {text.slice(range[0], range[1])}
          </mark>
          {text.slice(range[1])}
        </>
      ) : (
        text
      )}
    </div>
  );
}

function QuoteHint({
  quote,
  onShow,
}: {
  quote: string | null | undefined;
  onShow: (q: string) => void;
}) {
  if (!quote) return <span className="text-ink-400">AI suggestion: {NOT_SPECIFIED}</span>;
  return (
    <button
      type="button"
      className="text-pine-700 text-left underline-offset-2 hover:underline"
      onClick={() => onShow(quote)}
    >
      From the job description: “{quote.length > 90 ? `${quote.slice(0, 90)}…` : quote}”
    </button>
  );
}

export function ExtractionReview({
  app,
  jd,
  onClose,
}: {
  app: Application;
  jd: JobDescription;
  onClose: () => void;
}) {
  const meta = useMeta();
  const qc = useQueryClient();
  const toast = useToast();
  const choices = useMemo(
    () => ({
      employment_types: meta.data?.employment_types ?? [],
      work_arrangements: meta.data?.work_arrangements ?? [],
    }),
    [meta.data],
  );
  const [form, setForm] = useState<ReviewedData>(() => initialReview(jd, app, choices));
  // Lists are edited as plain text, one item per line, and split on approve.
  const [listText, setListText] = useState<Record<ListKey, string>>(() => {
    const initial = initialReview(jd, app, choices);
    return Object.fromEntries(LISTS.map(({ key }) => [key, initial[key].join("\n")])) as Record<
      ListKey,
      string
    >;
  });
  const [highlight, setHighlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ai: Partial<Extraction> = jd.raw_ai_output?.output ?? {};
  const discarded = jd.raw_ai_output?.discarded ?? [];

  const approve = useMutation({
    mutationFn: () => {
      const lists = Object.fromEntries(
        LISTS.map(({ key }) => [
          key,
          listText[key]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        ]),
      );
      return api.put<JobDescription>(`/applications/${app.id}/job-description/review`, {
        ...form,
        ...lists,
      });
    },
    onSuccess: (data) => {
      qc.setQueryData(jdKey(app.id), data);
      void qc.invalidateQueries({ queryKey: ["applications"] });
      void qc.invalidateQueries({ queryKey: ["activities", app.id] });
      toast.show("Review approved. Your application details are updated.");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const set = <K extends keyof ReviewedData>(key: K, value: ReviewedData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Review extracted details"
      description="AI-extracted. Review and correct anything before relying on it. Your application changes only when you approve."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="check"
            loading={approve.isPending}
            onClick={() => approve.mutate()}
          >
            Approve and update application
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="lg:sticky lg:top-0 lg:h-[65vh]">
          <p className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">
            Source · original job description
          </p>
          <SourcePanel text={jd.original_text} highlight={highlight} />
        </div>
        <div className="space-y-5">
          <FormError message={error} />
          <p className="text-ink-500 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            Editable fields{" "}
            <Badge tone="violet" icon="sparkles">
              Prefilled from AI suggestion
            </Badge>
          </p>
          {SCALARS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              hint={<QuoteHint quote={ai[key]?.quote} onShow={setHighlight} />}
            >
              {(a) => (
                <Input
                  {...a}
                  value={form[key] ?? ""}
                  placeholder={NOT_SPECIFIED}
                  onChange={(e) => set(key, e.target.value || null)}
                  onFocus={() => setHighlight(ai[key]?.quote ?? null)}
                />
              )}
            </Field>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Employment type"
              hint={<QuoteHint quote={ai.employment_type?.quote} onShow={setHighlight} />}
            >
              {(a) => (
                <Select
                  {...a}
                  value={form.employment_type ?? ""}
                  onChange={(e) => set("employment_type", e.target.value || null)}
                >
                  <option value="">{NOT_SPECIFIED}</option>
                  {choices.employment_types.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Work arrangement"
              hint={<QuoteHint quote={ai.work_arrangement?.quote} onShow={setHighlight} />}
            >
              {(a) => (
                <Select
                  {...a}
                  value={form.work_arrangement ?? ""}
                  onChange={(e) => set("work_arrangement", e.target.value || null)}
                >
                  <option value="">{NOT_SPECIFIED}</option>
                  {choices.work_arrangements.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <fieldset className="border-line space-y-3 rounded-lg border p-4">
            <legend className="text-ink-700 px-1 text-sm font-medium">Deadline</legend>
            <Field
              label="As written in the job description"
              hint={<QuoteHint quote={ai.deadline?.quote} onShow={setHighlight} />}
            >
              {(a) => (
                <Input
                  {...a}
                  value={form.deadline_text ?? ""}
                  placeholder={NOT_SPECIFIED}
                  onChange={(e) => set("deadline_text", e.target.value || null)}
                />
              )}
            </Field>
            <Field
              label="Date"
              hint={
                ai.deadline && !ai.deadline.parsed_date
                  ? "The date wasn't unambiguous (or had no year), so it wasn't filled in. Enter it yourself if you know it."
                  : "Only filled in automatically when the written date is unambiguous and includes the year."
              }
            >
              {(a) => (
                <Input
                  {...a}
                  type="date"
                  value={form.deadline ?? ""}
                  onChange={(e) => set("deadline", e.target.value || null)}
                />
              )}
            </Field>
          </fieldset>
          {LISTS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              hint={
                ai[key]?.length
                  ? `One per line. ${ai[key].length} item${ai[key].length === 1 ? "" : "s"} suggested, each backed by a quote.`
                  : `AI suggestion: ${NOT_SPECIFIED}. One per line.`
              }
            >
              {(a) => (
                <Textarea
                  {...a}
                  rows={Math.min(8, Math.max(2, listText[key].split("\n").length + 1))}
                  value={listText[key]}
                  placeholder={NOT_SPECIFIED}
                  onFocus={() => setHighlight(ai[key]?.[0]?.quote ?? null)}
                  onChange={(e) => setListText((t) => ({ ...t, [key]: e.target.value }))}
                />
              )}
            </Field>
          ))}
          {discarded.length > 0 ? (
            <Notice
              tone="warning"
              title={`${discarded.length} suggestion${discarded.length === 1 ? " was" : "s were"} removed`}
            >
              The AI suggested {discarded.length === 1 ? "a value" : "values"} that couldn&apos;t be
              found in the job description, so {discarded.length === 1 ? "it was" : "they were"}{" "}
              discarded:
              <ul className="mt-1 list-disc pl-5">
                {discarded.slice(0, 6).map((d, i) => (
                  <li key={i}>
                    {d.field.replace(/_/g, " ")}: “{d.value}”
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
