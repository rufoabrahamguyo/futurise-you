import { useState } from "react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/Feedback";
import { Field, FormError, Input, Select, Textarea } from "@/components/Field";
import { Icon, type IconName } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useCurrentUser } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api";
import { formatDateTime, utcToZoned, zonedTimeToUtc } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type { Activity, Application } from "@/lib/types";

import {
  type ActivityInput,
  useActivities,
  useAddActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "./timeline";

const ICONS: Record<string, IconName> = {
  created: "plus",
  status_change: "refresh",
  submitted: "lock",
  document_attached: "file",
  document_removed: "file",
  job_description: "note",
  extraction_reviewed: "check",
  interview_prep: "sparkles",
  reminder: "bell",
  restored: "history",
  note: "note",
  follow_up: "mail",
  email: "mail",
  call: "user",
  interview: "user",
  assessment: "pencil",
  other: "info",
};

export function TimelineTab({ app, initialType }: { app: Application; initialType?: string }) {
  const activities = useActivities(app.id);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <ActivityComposer app={app} initialType={initialType} />
      </div>
      <section className="lg:col-span-3" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="sr-only">
          Timeline, newest first
        </h2>
        {activities.isPending ? (
          <SkeletonRows rows={5} label="Loading timeline" />
        ) : activities.isError ? (
          <ErrorState
            message={errorMessage(activities.error)}
            onRetry={() => void activities.refetch()}
          />
        ) : activities.data.results.length === 0 ? (
          <div className="card">
            <EmptyState icon="history" title="Nothing recorded yet" compact>
              Status changes and submissions appear here automatically. Add calls, emails and notes
              as they happen.
            </EmptyState>
          </div>
        ) : (
          <ol className="border-line relative space-y-1 border-l pl-6">
            {activities.data.results.map((activity) => (
              <TimelineEntry key={activity.id} app={app} activity={activity} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ActivityComposer({ app, initialType }: { app: Application; initialType?: string }) {
  const meta = useMeta();
  const user = useCurrentUser();
  const add = useAddActivity(app.id);
  const toast = useToast();
  const now = utcToZoned(new Date().toISOString(), user.timezone);
  const [type, setType] = useState(initialType ?? "note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);

  const types =
    meta.data?.activity_types.filter((t) => meta.data.manual_activity_types.includes(t.value)) ??
    [];

  return (
    <form
      className="card space-y-4 p-5"
      aria-labelledby="composer-heading"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return setError("Add a short summary.");
        setError(undefined);
        setFormError(null);
        add.mutate(
          {
            type,
            title: title.trim(),
            body,
            occurred_at: zonedTimeToUtc(date, time, user.timezone),
          },
          {
            onSuccess: () => {
              setTitle("");
              setBody("");
              toast.show("Added to the timeline.");
            },
            onError: (err) => setFormError(errorMessage(err)),
          },
        );
      }}
    >
      <h2 id="composer-heading" className="font-sans text-base font-semibold tracking-normal">
        Record an update
      </h2>
      <FormError message={formError} />
      <Field label="Type">
        {(a) => (
          <Select {...a} value={type} onChange={(e) => setType(e.target.value)}>
            {(types.length ? types : [{ value: "note", label: "Note" }]).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Summary" error={error}>
        {(a) => (
          <Input
            {...a}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Followed up with the recruiter"
          />
        )}
      </Field>
      <Field label="Details" optional>
        {(a) => <Textarea {...a} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          {(a) => (
            <Input {...a} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
        <Field label="Time">
          {(a) => (
            <Input {...a} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          )}
        </Field>
      </div>
      <Button type="submit" variant="primary" className="w-full" loading={add.isPending}>
        Add to timeline
      </Button>
    </form>
  );
}

function TimelineEntry({ app, activity }: { app: Application; activity: Activity }) {
  const meta = useMeta();
  const user = useCurrentUser();
  const toast = useToast();
  const update = useUpdateActivity(app.id);
  const remove = useDeleteActivity(app.id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState<ActivityInput>({});
  const editable =
    !activity.is_system_generated &&
    (meta.data?.manual_activity_types.includes(activity.type) ?? false);

  return (
    <li className="relative pb-5">
      <span
        className={`ring-paper absolute top-0.5 -left-[37px] flex size-6 items-center justify-center rounded-full ring-4 ${activity.type === "submitted" ? "bg-pine-800 text-white" : "bg-surface text-pine-700 ring-offset-0"} border-line border`}
      >
        <Icon name={ICONS[activity.type] ?? "info"} className="size-3.5" />
      </span>
      {editing ? (
        <div className="card space-y-3 p-4">
          <Field label="Summary">
            {(a) => (
              <Input
                {...a}
                value={draft.title ?? activity.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            )}
          </Field>
          <Field label="Details" optional>
            {(a) => (
              <Textarea
                {...a}
                rows={3}
                value={draft.body ?? activity.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: activity.id, ...draft },
                  {
                    onSuccess: () => setEditing(false),
                    onError: (e) => toast.show(errorMessage(e), "error"),
                  },
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="card px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-ink-900 font-medium">{activity.title}</p>
            <time dateTime={activity.occurred_at} className="text-ink-500 text-xs">
              {formatDateTime(activity.occurred_at, user.timezone)}
            </time>
          </div>
          <p className="text-ink-500 mt-0.5 text-xs">
            {labelFor(meta.data?.activity_types, activity.type)}
            {activity.is_system_generated ? " · Recorded automatically" : ""}
          </p>
          {activity.body ? (
            <p className="text-ink-700 mt-2 text-sm whitespace-pre-wrap">{activity.body}</p>
          ) : null}
          {editable ? (
            <div className="mt-2 flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon="pencil"
                onClick={() => {
                  setDraft({});
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirm(true)}>
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Delete this timeline entry?"
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          remove.mutate(activity.id, {
            onSuccess: () => setConfirm(false),
            onError: (e) => toast.show(errorMessage(e), "error"),
          })
        }
      >
        “{activity.title}” will be removed from this application&apos;s history.
      </ConfirmDialog>
    </li>
  );
}
