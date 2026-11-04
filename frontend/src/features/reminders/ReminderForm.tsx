import { useState } from "react";

import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { useApplications } from "@/features/applications/api";
import { useCurrentUser } from "@/features/auth/hooks";
import { ApiError, errorMessage } from "@/lib/api";
import { utcToZoned, zonedTimeToUtc } from "@/lib/format";
import { useMeta } from "@/lib/meta";
import type { Reminder } from "@/lib/types";

import { useCreateReminder, useUpdateReminder } from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  reminder?: Reminder;
  applicationId?: string;
  defaults?: { type?: string; title?: string; remindAt?: string };
}

/** Create or edit a reminder. Times are entered in the user's time zone and stored in UTC. */
export function ReminderFormDialog({ open, onClose, reminder, applicationId, defaults }: Props) {
  if (!open) return null;
  return (
    <ReminderFormInner
      onClose={onClose}
      reminder={reminder}
      applicationId={applicationId}
      defaults={defaults}
    />
  );
}

function ReminderFormInner({ onClose, reminder, applicationId, defaults }: Omit<Props, "open">) {
  const user = useCurrentUser();
  const meta = useMeta();
  const toast = useToast();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const apps = useApplications({ page_size: 200, ordering: "title" });
  // Default to tomorrow; computed once when the form opens.
  const [start] = useState(() =>
    utcToZoned(
      reminder?.remind_at ?? defaults?.remindAt ?? new Date(Date.now() + 86_400_000).toISOString(),
      user.timezone,
    ),
  );
  const [appId, setAppId] = useState(reminder?.application.id ?? applicationId ?? "");
  const [type, setType] = useState(reminder?.type ?? defaults?.type ?? "follow_up");
  const [title, setTitle] = useState(reminder?.title ?? defaults?.title ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(reminder || defaults?.remindAt ? start.time : "09:00");
  const [channels, setChannels] = useState<string[]>(reminder?.channels ?? ["in_app", "email"]);
  const [notes, setNotes] = useState(reminder?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    const next: Record<string, string> = {};
    if (!appId) next.application_id = "Choose an application.";
    if (!title.trim()) next.title = "Add a short title.";
    if (!date || !time) next.remind_at = "Choose a date and time.";
    if (channels.length === 0) next.channels = "Choose at least one way to be reminded.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const input = {
      application_id: appId,
      type,
      title: title.trim(),
      notes,
      channels,
      remind_at: zonedTimeToUtc(date, time, user.timezone),
    };
    try {
      if (reminder) await update.mutateAsync({ id: reminder.id, ...input });
      else await create.mutateAsync(input);
      toast.show(reminder ? "Reminder updated." : "Reminder set.");
      onClose();
    } catch (error) {
      const fields = error instanceof ApiError ? error.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(error));
    }
  }

  function toggle(channel: string) {
    setChannels((c) => (c.includes(channel) ? c.filter((x) => x !== channel) : [...c, channel]));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={reminder ? "Edit reminder" : "New reminder"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            onClick={() => void submit()}
          >
            {reminder ? "Save reminder" : "Set reminder"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={formError} />
        {!applicationId ? (
          <Field label="Application" error={errors.application_id}>
            {(a) => (
              <Select
                {...a}
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                disabled={Boolean(reminder)}
              >
                <option value="">Choose an application…</option>
                {apps.data?.results.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.job_title} — {app.company.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            {(a) => (
              <Select {...a} value={type} onChange={(e) => setType(e.target.value)}>
                {meta.data?.reminder_types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Title" error={errors.title}>
            {(a) => (
              <Input
                {...a}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow up with the recruiter"
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" error={errors.remind_at}>
            {(a) => (
              <Input {...a} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <Field label="Time" hint={`Your time zone: ${user.timezone}`}>
            {(a) => (
              <Input {...a} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="text-ink-700 mb-1.5 text-sm font-medium">Remind me by</legend>
          <div className="flex flex-wrap gap-4">
            {[
              { value: "in_app", label: "In-app notification" },
              { value: "email", label: "Email" },
            ].map((c) => (
              <label key={c.value} className="text-ink-700 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channels.includes(c.value)}
                  onChange={() => toggle(c.value)}
                  className="accent-pine-700 size-4"
                />
                {c.label}
              </label>
            ))}
          </div>
          {errors.channels ? (
            <p role="alert" className="text-rose-ink mt-1.5 text-xs font-medium">
              {errors.channels}
            </p>
          ) : null}
          {channels.includes("email") && !user.is_email_verified ? (
            <p className="text-amber-ink mt-1.5 text-xs">
              Confirm your email address to receive reminder emails.
            </p>
          ) : null}
          {channels.includes("email") && !user.email_notifications ? (
            <p className="text-amber-ink mt-1.5 text-xs">
              Email notifications are turned off in Settings.
            </p>
          ) : null}
        </fieldset>
        <Field label="Notes" optional>
          {(a) => (
            <Textarea {...a} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
