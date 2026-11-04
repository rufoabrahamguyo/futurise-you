import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/Dialog";
import { Notice } from "@/components/Feedback";
import { Select } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import { labelFor, useMeta } from "@/lib/meta";
import { statusStyle } from "@/lib/statusStyles";
import type { ApplicationSummary } from "@/lib/types";

import { useChangeStatus } from "./api";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = useMeta();
  const style = statusStyle(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.badge}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {label ?? labelFor(meta.data?.statuses, status)}
    </span>
  );
}

type Target = Pick<
  ApplicationSummary,
  "id" | "job_title" | "status" | "submitted_at" | "has_cv_attached"
>;

/**
 * Changes status, confirming first when the move to Applied will freeze the
 * attachments (and warning when no CV is attached). Used by every view.
 */
export function useStatusChanger() {
  const change = useChangeStatus();
  const toast = useToast();
  const meta = useMeta();
  const [pending, setPending] = useState<{ app: Target; status: string } | null>(null);

  function run(app: Target, status: string) {
    change.mutate(
      { id: app.id, status },
      {
        onSuccess: (result) => {
          const label = labelFor(meta.data?.statuses, status);
          if (result.warnings.includes("no_cv")) {
            toast.show(`Moved to ${label}. No CV was attached when it was submitted.`, "info");
          } else {
            toast.show(`Moved “${app.job_title}” to ${label}.`);
          }
        },
        onError: (error) => toast.show(`Status not changed: ${errorMessage(error)}`, "error"),
      },
    );
  }

  function request(app: Target, status: string) {
    if (status === app.status) return;
    if (status === "applied" && !app.submitted_at) {
      setPending({ app, status });
      return;
    }
    run(app, status);
  }

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Mark as applied?"
      confirmLabel={pending?.app.has_cv_attached ? "Mark as applied" : "Continue without a CV"}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) run(pending.app, pending.status);
        setPending(null);
      }}
    >
      <div className="space-y-3">
        <p>
          The files attached to <strong>{pending?.app.job_title}</strong> will be locked as the
          submitted version. You can still add files later; they&apos;ll be labelled “Added after
          submission”.
        </p>
        {pending && !pending.app.has_cv_attached ? (
          <Notice tone="warning" title="No CV attached">
            You haven&apos;t attached a CV. If you sent one, attach it first so this record shows
            exactly what you submitted.
          </Notice>
        ) : null}
      </div>
    </ConfirmDialog>
  );

  return { request, dialog, isPending: change.isPending };
}

/** Keyboard-accessible status menu (a native select). */
export function StatusSelect({
  app,
  onChange,
  size = "md",
  label = "Status",
}: {
  app: Target;
  onChange: (status: string) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const meta = useMeta();
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label} for {app.job_title}
      </label>
      <Select
        id={id}
        value={app.status}
        onChange={(e) => onChange(e.target.value)}
        className={size === "sm" ? "!h-8 !w-auto py-0 text-xs" : "!w-auto"}
      >
        {(meta.data?.statuses ?? [{ value: app.status, label: app.status }]).map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
    </>
  );
}
