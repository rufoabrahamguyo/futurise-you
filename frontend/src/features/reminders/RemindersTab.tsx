import { useState } from "react";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/Feedback";
import { useToast } from "@/components/Toast";
import { useCurrentUser } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api";
import { utcToZoned, zonedTimeToUtc } from "@/lib/format";
import type { Application, Reminder } from "@/lib/types";

import { useCreateReminder, useReminders } from "./api";
import { ReminderFormDialog } from "./ReminderForm";
import { RecordFollowUpDialog, ReminderList } from "./ReminderList";

function daysFromNowAt9(days: number, timeZone: string): string {
  const target = utcToZoned(new Date(Date.now() + days * 86_400_000).toISOString(), timeZone);
  return zonedTimeToUtc(target.date, "09:00", timeZone);
}

export function RemindersTab({ app }: { app: Application }) {
  const user = useCurrentUser();
  const toast = useToast();
  const reminders = useReminders({ application: app.id, page_size: 200 });
  const create = useCreateReminder();
  const [custom, setCustom] = useState<null | { type: string; title: string }>(null);
  const [followUp, setFollowUp] = useState<Reminder | null>(null);

  function quickFollowUp(days: number) {
    create.mutate(
      {
        application_id: app.id,
        type: "follow_up",
        title: `Follow up with ${app.company.name}`,
        remind_at: daysFromNowAt9(days, user.timezone),
        channels: ["in_app", "email"],
      },
      {
        onSuccess: () =>
          toast.show(`Follow-up set for ${days === 3 ? "3 days" : "1 week"} from now, at 9:00.`),
        onError: (e) => toast.show(errorMessage(e), "error"),
      },
    );
  }

  const open =
    reminders.data?.results.filter((r) => r.status === "pending" || r.status === "sent") ?? [];
  const closed =
    reminders.data?.results.filter((r) => r.status === "completed" || r.status === "cancelled") ??
    [];

  return (
    <div className="space-y-6">
      <section className="card p-5" aria-labelledby="follow-up-heading">
        <h2 id="follow-up-heading" className="font-sans text-base font-semibold tracking-normal">
          Set a follow-up
        </h2>
        <p className="text-ink-500 mt-1 text-sm">We&apos;ll remind you in the app and by email.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => quickFollowUp(3)} disabled={create.isPending}>
            In 3 days
          </Button>
          <Button onClick={() => quickFollowUp(7)} disabled={create.isPending}>
            In 1 week
          </Button>
          <Button
            onClick={() =>
              setCustom({ type: "follow_up", title: `Follow up with ${app.company.name}` })
            }
          >
            Custom…
          </Button>
          <Button
            variant="ghost"
            icon="plus"
            onClick={() => setCustom({ type: "interview", title: "" })}
          >
            Other reminder
          </Button>
        </div>
      </section>

      {reminders.isPending ? (
        <SkeletonRows rows={3} label="Loading reminders" />
      ) : reminders.isError ? (
        <ErrorState
          message={errorMessage(reminders.error)}
          onRetry={() => void reminders.refetch()}
        />
      ) : reminders.data.results.length === 0 ? (
        <div className="card">
          <EmptyState icon="bell" title="No reminders for this application" compact>
            Set a follow-up so you don&apos;t lose track after applying.
          </EmptyState>
        </div>
      ) : (
        <>
          {open.length ? (
            <section className="card overflow-hidden" aria-label="Open reminders">
              <h2 className="border-line border-b px-5 py-3 font-sans text-sm font-semibold tracking-normal">
                Open
              </h2>
              <ReminderList
                onFollowUpCompleted={setFollowUp}
                reminders={open}
                showApplication={false}
              />
            </section>
          ) : null}
          {closed.length ? (
            <section className="card overflow-hidden" aria-label="Past reminders">
              <h2 className="border-line border-b px-5 py-3 font-sans text-sm font-semibold tracking-normal">
                Past
              </h2>
              <ReminderList
                onFollowUpCompleted={setFollowUp}
                reminders={closed}
                showApplication={false}
              />
            </section>
          ) : null}
        </>
      )}
      {followUp ? (
        <RecordFollowUpDialog reminder={followUp} onClose={() => setFollowUp(null)} />
      ) : null}
      <ReminderFormDialog
        open={custom !== null}
        onClose={() => setCustom(null)}
        applicationId={app.id}
        defaults={custom ?? undefined}
      />
    </div>
  );
}
