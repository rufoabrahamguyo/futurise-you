import { useState } from "react";

import { useNow } from "@/lib/useNow";
import { Link } from "react-router";

import { Button } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { Field, Input, Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useAddActivity } from "@/features/applications/timeline";
import { useCurrentUser } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type { Reminder } from "@/lib/types";

import { useReminderAction } from "./api";
import { ReminderFormDialog } from "./ReminderForm";

const TYPE_DOT: Record<string, string> = {
  deadline: "bg-rose-ink",
  follow_up: "bg-pine-600",
  interview: "bg-amber-500",
  assessment: "bg-violet-500",
  recruiter_response: "bg-sky-500",
  other: "bg-ink-400",
};

interface ListProps {
  reminders: Reminder[];
  showApplication?: boolean;
  /** Called after a follow-up is completed, so the parent can ask what happened. */
  onFollowUpCompleted: (reminder: Reminder) => void;
}

export function ReminderList({
  reminders,
  showApplication = true,
  onFollowUpCompleted,
}: ListProps) {
  return (
    <ul className="divide-line divide-y">
      {reminders.map((r) => (
        <ReminderRow
          key={r.id}
          reminder={r}
          showApplication={showApplication}
          onFollowUpCompleted={onFollowUpCompleted}
        />
      ))}
    </ul>
  );
}

function ReminderRow({
  reminder,
  showApplication,
  onFollowUpCompleted,
}: {
  reminder: Reminder;
  showApplication: boolean;
  onFollowUpCompleted: (reminder: Reminder) => void;
}) {
  const user = useCurrentUser();
  const meta = useMeta();
  const toast = useToast();
  const action = useReminderAction();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = reminder.status === "pending" || reminder.status === "sent";
  const now = useNow();
  const overdue = open && new Date(reminder.remind_at).getTime() < now;

  function complete() {
    action.mutate(
      { id: reminder.id, action: "complete" },
      {
        onSuccess: () => {
          if (reminder.type === "follow_up") onFollowUpCompleted(reminder);
          else toast.show("Reminder completed.");
        },
        onError: (e) => toast.show(errorMessage(e), "error"),
      },
    );
  }

  return (
    <li
      className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center ${overdue ? "bg-rose-50/60" : ""}`}
    >
      <span
        className={`mt-1.5 size-2.5 shrink-0 self-start rounded-full sm:self-center ${TYPE_DOT[reminder.type] ?? "bg-ink-400"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className={`font-medium ${reminder.status === "completed" || reminder.status === "cancelled" ? "text-ink-500 line-through" : "text-ink-900"}`}
        >
          {reminder.title}
        </p>
        <p className="text-ink-500 mt-0.5 text-xs">
          {labelFor(meta.data?.reminder_types, reminder.type)} ·{" "}
          {formatDateTime(reminder.remind_at, user.timezone)}
          {open ? ` · ${formatRelative(reminder.remind_at)}` : ""}
          {overdue ? (
            <span className="text-rose-ink ml-1 font-semibold">
              <Icon name="alert" className="mr-0.5 inline size-3" />
              Overdue
            </span>
          ) : null}
          {reminder.status === "completed"
            ? " · Completed"
            : reminder.status === "cancelled"
              ? " · Cancelled"
              : reminder.status === "sent"
                ? " · Notified"
                : ""}
        </p>
        {showApplication ? (
          <Link
            to={`/applications/${reminder.application.id}?tab=reminders`}
            className="text-pine-700 mt-0.5 block truncate text-xs font-medium hover:underline"
          >
            {reminder.application.job_title} at {reminder.application.company_name}
          </Link>
        ) : null}
        {reminder.notes ? (
          <p className="text-ink-700 mt-1 text-sm whitespace-pre-wrap">{reminder.notes}</p>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="primary"
            icon="check"
            onClick={complete}
            loading={action.isPending && action.variables.action === "complete"}
          >
            Complete
          </Button>
          <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" icon="x" onClick={() => setConfirmCancel(true)}>
            Cancel
          </Button>
        </div>
      ) : null}
      <ReminderFormDialog open={editing} onClose={() => setEditing(false)} reminder={reminder} />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this reminder?"
        confirmLabel="Cancel reminder"
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() =>
          action.mutate(
            { id: reminder.id, action: "cancel" },
            {
              onSuccess: () => {
                setConfirmCancel(false);
                toast.show("Reminder cancelled.");
              },
              onError: (e) => toast.show(errorMessage(e), "error"),
            },
          )
        }
      >
        You won&apos;t be notified about “{reminder.title}”.
      </ConfirmDialog>
    </li>
  );
}

/** After completing a follow-up, ask what happened and put it on the timeline. */
export function RecordFollowUpDialog({
  reminder,
  onClose,
}: {
  reminder: Reminder;
  onClose: () => void;
}) {
  const add = useAddActivity(reminder.application.id);
  const toast = useToast();
  const [title, setTitle] = useState(
    `Followed up: ${reminder.title.replace(/^follow up( with)?\s*/i, "")}`.trim(),
  );
  const [body, setBody] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record the follow-up"
      description={`Add what happened to the timeline for ${reminder.application.job_title} at ${reminder.application.company_name}.`}
      footer={
        <>
          <Button onClick={onClose}>Skip</Button>
          <Button
            variant="primary"
            loading={add.isPending}
            onClick={() =>
              add.mutate(
                { type: "follow_up", title: title.trim() || "Followed up", body },
                {
                  onSuccess: () => {
                    toast.show("Follow-up recorded on the timeline.");
                    onClose();
                  },
                  onError: (e) => toast.show(errorMessage(e), "error"),
                },
              )
            }
          >
            Add to timeline
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Summary">
          {(a) => (
            <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
          )}
        </Field>
        <Field label="What happened?" optional>
          {(a) => (
            <Textarea
              {...a}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Emailed Sam; they expect to decide next week."
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
