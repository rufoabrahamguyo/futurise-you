import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Notice } from "@/components/Feedback";
import { Field, FormError, Input, Select } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { AINoticeContent } from "@/features/ai/AINotice";
import { downloadFile } from "@/features/documents/api";
import { meKey, useCurrentUser, useUpdateMe } from "@/features/auth/hooks";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="card scroll-mt-24 p-5 sm:p-6">
      <h2
        id={`${id}-heading`}
        className="text-ink-900 font-sans text-base font-semibold tracking-normal"
      >
        {title}
      </h2>
      {description ? <p className="text-ink-500 mt-1 text-sm">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, notifications, AI, data and account."
      />
      <div className="max-w-3xl space-y-6">
        <ProfileSection />
        <NotificationsSection />
        <PasswordSection />
        <AISection />
        <ExportSection />
        <DeleteSection />
      </div>
    </>
  );
}

function ProfileSection() {
  const user = useCurrentUser();
  const update = useUpdateMe();
  const toast = useToast();
  const [name, setName] = useState(user.full_name);
  const [tz, setTz] = useState(user.timezone);
  const zones = timeZones();
  return (
    <Section
      id="profile"
      title="Profile"
      description="Dates and reminder times are shown in your time zone."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { full_name: name.trim(), timezone: tz },
            {
              onSuccess: () => toast.show("Profile saved."),
              onError: (err) => toast.show(errorMessage(err), "error"),
            },
          );
        }}
      >
        <Field label="Email" hint="Your sign-in email can't be changed here.">
          {(a) => <Input {...a} value={user.email} readOnly disabled />}
        </Field>
        <Field label="Full name">
          {(a) => (
            <Input
              {...a}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
        </Field>
        <Field label="Time zone">
          {(a) => (
            <Select {...a} value={tz} onChange={(e) => setTz(e.target.value)}>
              {(zones.includes(tz) ? zones : [tz, ...zones]).map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={update.isPending}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function NotificationsSection() {
  const user = useCurrentUser();
  const update = useUpdateMe();
  const toast = useToast();
  return (
    <Section
      id="notifications"
      title="Notifications"
      description="In-app reminders always appear under the bell."
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="accent-pine-700 mt-0.5 size-4"
          checked={user.email_notifications}
          onChange={(e) =>
            update.mutate(
              { email_notifications: e.target.checked },
              {
                onSuccess: (u) =>
                  toast.show(
                    u.email_notifications
                      ? "Reminder emails turned on."
                      : "Reminder emails turned off.",
                  ),
                onError: (err) => toast.show(errorMessage(err), "error"),
              },
            )
          }
        />
        <span className="text-sm">
          <span className="text-ink-900 font-medium">Email me when a reminder is due</span>
          <span className="text-ink-500 block">Sent to {user.email}.</span>
          {!user.is_email_verified ? (
            <span className="text-amber-ink block">
              Confirm your email address first; we only email verified addresses.
            </span>
          ) : null}
        </span>
      </label>
    </Section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: () =>
      api.post<undefined>("/auth/change-password", {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setErrors({});
      toast.show("Password changed.");
    },
    onError: (e) =>
      setErrors(e instanceof ApiError ? e.fieldErrors() : { new_password: errorMessage(e) }),
  });
  return (
    <Section id="password" title="Password">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (next.length < 10) return setErrors({ new_password: "Use at least 10 characters." });
          change.mutate();
        }}
      >
        <Field label="Current password" error={errors.current_password}>
          {(a) => (
            <Input
              {...a}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="New password" error={errors.new_password}>
          {(a) => (
            <Input
              {...a}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending} disabled={!current || !next}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

function AISection() {
  const user = useCurrentUser();
  const usage = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<{ used_today: number; daily_limit: number }>("/ai/usage"),
  });
  return (
    <Section
      id="ai"
      title="AI processing"
      description={
        user.ai_acknowledged_at ? (
          <>
            You acknowledged this notice on {formatDateTime(user.ai_acknowledged_at, user.timezone)}
            .
          </>
        ) : (
          "You'll see this notice before your first AI action."
        )
      }
    >
      <AINoticeContent />
      {usage.data ? (
        <p className="text-ink-500 mt-4 text-sm">
          AI requests today:{" "}
          <span className="text-ink-900 font-medium">{usage.data.used_today}</span> of{" "}
          {usage.data.daily_limit}.
        </p>
      ) : null}
    </Section>
  );
}

interface ExportJob {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  size: number | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  downloadable: boolean;
}

function ExportSection() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const exports = useQuery({
    queryKey: ["exports"],
    queryFn: () => api.get<ExportJob[]>("/exports"),
    refetchInterval: (q) =>
      q.state.data?.some((e) => e.status === "queued" || e.status === "processing") ? 2000 : false,
  });
  const request = useMutation({
    mutationFn: () => api.post<ExportJob>("/exports"),
    onSuccess: () => {
      toast.show("Preparing your export. We'll notify you when it's ready.");
      void qc.invalidateQueries({ queryKey: ["exports"] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const busy =
    exports.data?.some((e) => e.status === "queued" || e.status === "processing") ?? false;
  return (
    <Section
      id="export"
      title="Export your data"
      description="A ZIP with every application as JSON and CSV, your job descriptions, and every file you uploaded. Download links expire."
    >
      <Button
        icon="download"
        loading={request.isPending}
        disabled={busy}
        onClick={() => request.mutate()}
      >
        {busy ? "Preparing export…" : "Request export"}
      </Button>
      {exports.data && exports.data.length > 0 ? (
        <ul className="divide-line border-line mt-4 divide-y rounded-lg border">
          {exports.data.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-ink-900 block">
                  Requested {formatDateTime(job.created_at, user.timezone)}
                </span>
                <span className="text-ink-500 block text-xs">
                  {job.status === "succeeded" && job.expires_at
                    ? job.downloadable
                      ? `${job.size ? formatBytes(job.size) + " · " : ""}expires ${formatDateTime(job.expires_at, user.timezone)}`
                      : "Expired"
                    : job.status === "failed"
                      ? "Failed. Please request a new export."
                      : "Preparing…"}
                </span>
              </span>
              {job.downloadable ? (
                <Button
                  size="sm"
                  icon="download"
                  onClick={() =>
                    void downloadFile(`/exports/${job.id}/download`).catch((e: unknown) =>
                      toast.show(errorMessage(e), "error"),
                    )
                  }
                >
                  Download
                </Button>
              ) : (
                <Badge tone={job.status === "failed" ? "rose" : "neutral"}>
                  {job.status === "succeeded" ? "Expired" : job.status}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function DeleteSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.post<undefined>("/auth/delete-account", { password }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(meKey, null);
      void navigate("/login", { replace: true });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.fieldErrors().password ?? e.message) : errorMessage(e)),
  });
  return (
    <Section
      id="delete"
      title="Delete account"
      description="Permanently delete your account, every application record and every stored file. This can't be undone."
    >
      <Notice tone="warning">
        Consider exporting your data first. Deleting your account also removes submitted-document
        snapshots.
      </Notice>
      <div className="mt-4">
        <Button variant="danger" icon="trash" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account permanently?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText !== "DELETE" || !password}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-ink-700">
            All your applications, documents, versions, notes, reminders and AI results will be
            permanently deleted.
          </p>
          <FormError message={error} />
          <Field label="Type DELETE to confirm">
            {(a) => (
              <Input
                {...a}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Your password">
            {(a) => (
              <Input
                {...a}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Dialog>
    </Section>
  );
}
