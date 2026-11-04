import { useState } from "react";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { TabPanel, Tabs } from "@/components/Tabs";
import { errorMessage } from "@/lib/api";
import type { Reminder } from "@/lib/types";

import { type ReminderFilters, useReminders } from "./api";
import { ReminderFormDialog } from "./ReminderForm";
import { RecordFollowUpDialog, ReminderList } from "./ReminderList";

type Scope = NonNullable<ReminderFilters["scope"]>;

const SCOPES: { id: Scope; label: string; empty: string }[] = [
  {
    id: "upcoming",
    label: "Upcoming",
    empty: "Nothing scheduled. Set a follow-up from any application.",
  },
  { id: "overdue", label: "Overdue", empty: "You're all caught up." },
  { id: "completed", label: "Completed", empty: "Completed reminders appear here." },
  { id: "cancelled", label: "Cancelled", empty: "No cancelled reminders." },
];

export function RemindersPage() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [creating, setCreating] = useState(false);
  const [followUp, setFollowUp] = useState<Reminder | null>(null);
  const reminders = useReminders({ scope, page_size: 200 });
  const overdue = useReminders({ scope: "overdue", page_size: 1 });
  const current = SCOPES.find((s) => s.id === scope) ?? SCOPES[0];
  const overdueCount = overdue.data?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Calendar & Reminders"
        description="Follow-ups, interviews and deadlines, in your time zone. See them on a calendar in My Applications → Calendar."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New reminder
          </Button>
        }
      />
      <Tabs
        tabs={SCOPES.map((s) => ({
          id: s.id,
          label:
            s.id === "overdue" && overdueCount ? (
              <span>
                Overdue{" "}
                <span className="bg-rose-ink ml-1 rounded-full px-1.5 text-xs text-white">
                  {overdueCount}
                </span>
              </span>
            ) : (
              s.label
            ),
        }))}
        active={scope}
        onChange={(id) => setScope(id as Scope)}
        label="Reminder lists"
        idPrefix="reminders"
      />
      <TabPanel id={scope} idPrefix="reminders">
        {reminders.isPending ? (
          <SkeletonRows rows={4} label="Loading reminders" />
        ) : reminders.isError ? (
          <div className="card">
            <ErrorState
              message={errorMessage(reminders.error)}
              onRetry={() => void reminders.refetch()}
            />
          </div>
        ) : reminders.data.results.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="bell"
              title={`No ${current?.label.toLowerCase() ?? ""} reminders`}
              compact
            >
              {current?.empty}
            </EmptyState>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ReminderList onFollowUpCompleted={setFollowUp} reminders={reminders.data.results} />
          </div>
        )}
      </TabPanel>
      {followUp ? (
        <RecordFollowUpDialog reminder={followUp} onClose={() => setFollowUp(null)} />
      ) : null}
      <ReminderFormDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
