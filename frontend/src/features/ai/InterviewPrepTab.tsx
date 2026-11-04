import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "@/components/Feedback";
import { Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useCurrentUser } from "@/features/auth/hooks";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useMeta } from "@/lib/meta";
import type { Application, InterviewPreparation } from "@/lib/types";

import { aiErrorMessage, useAINotice } from "./AINotice";

export const PREP_DISCLAIMER =
  "AI-generated practice questions. These are not actual questions from the employer.";

const MISSING_LABELS: Record<string, string> = {
  job_description: "the job description",
  approved_requirements: "your reviewed requirements",
  submitted_cv: "a submitted CV",
  submitted_cv_text: "readable text in the submitted CV",
  submitted_cover_letter: "a submitted cover letter",
};

const key = (id: string) => ["interview-prep", id] as const;

export function InterviewPrepTab({ app }: { app: Application }) {
  const meta = useMeta();
  const qc = useQueryClient();
  const toast = useToast();
  const { withNotice } = useAINotice();
  const preps = useQuery({
    queryKey: key(app.id),
    queryFn: () => api.get<InterviewPreparation[]>(`/applications/${app.id}/interview-prep`),
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status === "queued" || p.status === "processing")
        ? 2000
        : false,
  });
  const generate = useMutation({
    mutationFn: () => api.post<InterviewPreparation>(`/applications/${app.id}/interview-prep`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key(app.id) });
      void qc.invalidateQueries({ queryKey: ["activities", app.id] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const order = meta.data?.statuses.map((s) => s.value) ?? [];
  const available =
    order.indexOf(app.status) >= order.indexOf("interview") && order.includes(app.status);

  if (!available) {
    return (
      <div className="card">
        <EmptyState icon="sparkles" title="Available when you reach Interview" compact>
          Once this application moves to Interview, you can generate practice questions from its job
          description and the CV you submitted.
        </EmptyState>
      </div>
    );
  }
  if (preps.isPending) return <SkeletonRows rows={4} label="Loading interview preparation" />;
  if (preps.isError)
    return <ErrorState message={errorMessage(preps.error)} onRetry={() => void preps.refetch()} />;

  const busy = preps.data.some((p) => p.status === "queued" || p.status === "processing");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-500 max-w-xl text-sm">
          Practice questions built only from this application&apos;s saved job description, your
          reviewed requirements, and the CV and cover letter you submitted.
        </p>
        <Button
          variant="primary"
          icon="sparkles"
          loading={generate.isPending}
          disabled={busy}
          onClick={() => withNotice(() => generate.mutate())}
        >
          {preps.data.length ? "Generate a new set" : "Prepare with AI"}
        </Button>
      </div>
      {preps.data.length === 0 ? (
        <div className="card">
          <EmptyState icon="sparkles" title="No practice material yet" compact>
            Generate technical, behavioural, CV-based and role-specific practice questions, plus
            topics to prepare. Each set is saved here with your notes.
          </EmptyState>
        </div>
      ) : (
        preps.data.map((prep, index) => (
          <PrepRecord key={prep.id} app={app} prep={prep} latest={index === 0} />
        ))
      )}
    </div>
  );
}

function PrepRecord({
  app,
  prep,
  latest,
}: {
  app: Application;
  prep: InterviewPreparation;
  latest: boolean;
}) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { withNotice } = useAINotice();
  const [notes, setNotes] = useState<string | null>(null);
  const [open, setOpen] = useState(latest);
  const saveNotes = useMutation({
    mutationFn: (user_notes: string) =>
      api.patch<InterviewPreparation>(`/interview-preps/${prep.id}`, { user_notes }),
    onSuccess: () => {
      setNotes(null);
      toast.show("Notes saved.");
      void qc.invalidateQueries({ queryKey: key(app.id) });
    },
    onError: (e) => toast.show(`Notes not saved: ${errorMessage(e)}`, "error"),
  });
  const retry = useMutation({
    mutationFn: () => api.post<InterviewPreparation>(`/interview-preps/${prep.id}/retry`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(app.id) }),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const header = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-ink-900 font-semibold">
        Practice set from {formatDateTime(prep.created_at, user.timezone)}
      </span>
      {latest ? (
        <span className="bg-pine-100 text-pine-800 rounded-full px-2 py-0.5 text-xs font-medium">
          Latest
        </span>
      ) : null}
    </span>
  );

  if (prep.status === "queued" || prep.status === "processing") {
    return (
      <section className="card p-5" aria-busy="true">
        {header}
        <p className="text-ink-700 mt-3 flex items-center gap-2 text-sm" aria-live="polite">
          <Spinner className="text-pine-700 size-4" />
          {prep.status === "queued"
            ? "Queued — starting shortly…"
            : "Writing practice questions from your saved record…"}
        </p>
        <div className="mt-4 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-ink-900/[0.06] h-10 animate-pulse rounded-lg" />
          ))}
        </div>
      </section>
    );
  }
  if (prep.status === "failed" || !prep.content) {
    return (
      <section className="card p-5">
        {header}
        <div className="mt-3">
          <Notice
            tone="danger"
            title="Generation didn't finish"
            action={
              <Button
                size="sm"
                icon="refresh"
                loading={retry.isPending}
                onClick={() => withNotice(() => retry.mutate())}
              >
                Retry
              </Button>
            }
          >
            {aiErrorMessage(prep.error)} Nothing in your application was changed.
          </Notice>
        </div>
      </section>
    );
  }

  const c = prep.content;
  return (
    <section
      className="card"
      aria-label={`Practice set from ${formatDateTime(prep.created_at, user.timezone)}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {header}
        <Icon
          name="chevronDown"
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-line space-y-6 border-t px-5 py-5">
          <div
            role="note"
            className="text-amber-ink flex gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {PREP_DISCLAIMER}
          </div>
          {prep.missing_inputs.length ? (
            <Notice tone="info" title="Generated from what was available">
              This set was made without{" "}
              {prep.missing_inputs.map((m) => MISSING_LABELS[m] ?? m).join(", ")}.
            </Notice>
          ) : null}
          <QuestionGroup title="Technical questions">
            {c.technical_questions.map((q, i) => (
              <QuestionItem key={i} question={q.question}>
                <p>
                  <span className="font-medium">Why it may come up:</span> {q.why_asked}
                </p>
                {q.answer_outline.length ? (
                  <ul className="mt-1 list-disc pl-5">
                    {q.answer_outline.map((point, j) => (
                      <li key={j}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </QuestionItem>
            ))}
          </QuestionGroup>
          <QuestionGroup title="Behavioural questions">
            {c.behavioral_questions.map((q, i) => (
              <QuestionItem key={i} question={q.question}>
                <p>
                  <span className="font-medium">Why it may come up:</span> {q.why_asked}
                </p>
                <p className="mt-1">
                  <span className="font-medium">STAR hint:</span> {q.star_hint}
                </p>
              </QuestionItem>
            ))}
          </QuestionGroup>
          <QuestionGroup
            title="Questions about your CV"
            empty="No CV text was available for this set."
          >
            {c.cv_questions.map((q, i) => (
              <QuestionItem key={i} question={q.question}>
                <p>
                  <span className="font-medium">From your CV:</span> {q.cv_evidence}
                </p>
              </QuestionItem>
            ))}
          </QuestionGroup>
          <QuestionGroup title="Role-specific questions">
            {c.role_questions.map((q, i) => (
              <QuestionItem key={i} question={q.question}>
                <p>
                  <span className="font-medium">Why it may come up:</span> {q.why_asked}
                </p>
              </QuestionItem>
            ))}
          </QuestionGroup>
          <section aria-labelledby={`topics-${prep.id}`}>
            <h3 id={`topics-${prep.id}`} className="text-ink-900 mb-2 text-sm font-semibold">
              Suggested preparation topics
            </h3>
            <ul className="text-ink-700 list-disc space-y-1 pl-5 text-sm">
              {c.preparation_topics.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby={`notes-${prep.id}`} className="border-line border-t pt-5">
            <h3 id={`notes-${prep.id}`} className="text-ink-900 mb-2 text-sm font-semibold">
              <label htmlFor={`notes-input-${prep.id}`}>My notes</label>
            </h3>
            <Textarea
              id={`notes-input-${prep.id}`}
              rows={5}
              value={notes ?? prep.user_notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Your answers, stories to tell, things to look up…"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                disabled={notes === null || notes === prep.user_notes}
                loading={saveNotes.isPending}
                onClick={() => notes !== null && saveNotes.mutate(notes)}
              >
                Save notes
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function QuestionGroup({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode[];
  empty?: string;
}) {
  return (
    <section aria-label={title}>
      <h3 className="text-ink-900 mb-2 text-sm font-semibold">{title}</h3>
      {children.length ? (
        <ul className="space-y-2">{children}</ul>
      ) : (
        <p className="text-ink-500 text-sm">{empty ?? "None in this set."}</p>
      )}
    </section>
  );
}

function QuestionItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <li>
      <details className="group border-line bg-paper/40 open:bg-surface rounded-lg border px-4 py-3">
        <summary className="text-ink-900 cursor-pointer list-none text-sm font-medium marker:hidden">
          <span className="flex items-start gap-2">
            <Icon
              name="chevronRight"
              className="text-ink-500 mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90"
            />
            {question}
          </span>
        </summary>
        <div className="text-ink-700 mt-2 pl-6 text-sm">{children}</div>
      </details>
    </li>
  );
}
