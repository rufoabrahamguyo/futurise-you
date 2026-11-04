import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { ErrorState, Skeleton } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { useCurrentUser } from "@/features/auth/hooks";
import { useReminders } from "@/features/reminders/api";
import { errorMessage } from "@/lib/api";
import { isoDateInZone, utcToZoned } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";

import { type ApplicationFilters, useApplications } from "./api";

interface CalendarItem {
  id: string;
  kind: "deadline" | "reminder";
  title: string;
  subtitle: string;
  href: string;
  time?: string;
  done?: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const start = Date.UTC(year, month, 1 - offset);
  const days: string[] = [];
  for (let i = 0; i < 42; i++)
    days.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  return days;
}

/** Month calendar of application deadlines and reminders, in the user's time zone. */
export function ApplicationCalendar({ filters }: { filters: ApplicationFilters }) {
  const user = useCurrentUser();
  const meta = useMeta();
  const today = isoDateInZone(new Date(), user.timezone);
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = monthGrid(cursor.year, cursor.month);
  const from = days[0] ?? today;
  const to = days[days.length - 1] ?? today;

  const apps = useApplications({
    ...filters,
    deadline_after: from,
    deadline_before: to,
    page_size: 200,
  });
  const reminders = useReminders({ from, to, page_size: 200 });

  const items = new Map<string, CalendarItem[]>();
  function add(day: string, item: CalendarItem) {
    items.set(day, [...(items.get(day) ?? []), item]);
  }
  for (const app of apps.data?.results ?? []) {
    if (app.deadline) {
      add(app.deadline, {
        id: `d-${app.id}`,
        kind: "deadline",
        title: `Deadline: ${app.job_title}`,
        subtitle: app.company.name,
        href: `/applications/${app.id}`,
      });
    }
  }
  for (const r of reminders.data?.results ?? []) {
    if (r.status === "cancelled") continue;
    const local = utcToZoned(r.remind_at, user.timezone);
    add(local.date, {
      id: `r-${r.id}`,
      kind: "reminder",
      title: r.title,
      subtitle: `${labelFor(meta.data?.reminder_types, r.type)} · ${r.application.company_name}`,
      href: `/applications/${r.application.id}?tab=reminders`,
      time: local.time,
      done: r.status === "completed",
    });
  }

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  const error = apps.error ?? reminders.error;
  const dayItems = openDay ? (items.get(openDay) ?? []) : [];

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-sans text-lg font-semibold tracking-normal" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" />
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })
            }
          >
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
            <Icon name="chevronRight" />
          </Button>
        </div>
      </div>
      <div className="text-ink-500 mb-3 flex gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-rose-ink size-2 rounded-full" aria-hidden="true" /> Deadline
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-pine-600 size-2 rounded-full" aria-hidden="true" /> Reminder
        </span>
      </div>
      {error ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => void Promise.all([apps.refetch(), reminders.refetch()])}
        />
      ) : apps.isPending || reminders.isPending ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <div
          role="table"
          aria-label={`Calendar for ${monthLabel}`}
          className="border-line grid grid-cols-7 overflow-hidden rounded-lg border"
        >
          <div role="row" className="contents">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                role="columnheader"
                className="border-line bg-paper text-ink-500 border-b px-1 py-2 text-center text-xs font-medium"
              >
                {d}
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div role="row" className="contents" key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const list = items.get(day) ?? [];
                const inMonth = Number(day.slice(5, 7)) - 1 === cursor.month;
                const label = new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${day}T00:00:00Z`));
                return (
                  <div
                    role="cell"
                    key={day}
                    className={`border-line min-h-16 border-b border-l first:border-l-0 sm:min-h-24 [&:nth-child(7n+1)]:border-l-0 ${inMonth ? "bg-surface" : "bg-paper/70"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDay(day)}
                      disabled={list.length === 0}
                      aria-label={`${label}${list.length ? `, ${list.length} item${list.length > 1 ? "s" : ""}` : ", nothing scheduled"}`}
                      className="enabled:hover:bg-pine-50 flex h-full w-full flex-col items-start gap-1 p-1.5 text-left disabled:cursor-default"
                    >
                      <span
                        className={`flex size-6 items-center justify-center rounded-full text-xs ${day === today ? "bg-pine-800 font-semibold text-white" : inMonth ? "text-ink-900" : "text-ink-400"}`}
                      >
                        {Number(day.slice(8))}
                      </span>
                      <span className="hidden w-full flex-col gap-0.5 sm:flex">
                        {list.slice(0, 2).map((item) => (
                          <span
                            key={item.id}
                            className="text-ink-700 flex items-center gap-1 truncate text-[11px]"
                          >
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${item.kind === "deadline" ? "bg-rose-ink" : "bg-pine-600"}`}
                              aria-hidden="true"
                            />
                            <span className={`truncate ${item.done ? "line-through" : ""}`}>
                              {item.title}
                            </span>
                          </span>
                        ))}
                        {list.length > 2 ? (
                          <span className="text-ink-500 text-[11px]">+{list.length - 2} more</span>
                        ) : null}
                      </span>
                      <span className="flex gap-0.5 sm:hidden" aria-hidden="true">
                        {list.slice(0, 3).map((item) => (
                          <span
                            key={item.id}
                            className={`size-1.5 rounded-full ${item.kind === "deadline" ? "bg-rose-ink" : "bg-pine-600"}`}
                          />
                        ))}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={
          openDay
            ? new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${openDay}T00:00:00Z`))
            : ""
        }
      >
        <ul className="divide-line divide-y">
          {dayItems.map((item) => (
            <li key={item.id} className="py-3">
              <Link to={item.href} className="hover:bg-paper flex items-start gap-3 rounded-lg">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${item.kind === "deadline" ? "bg-rose-ink" : "bg-pine-600"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span
                    className={`text-ink-900 block text-sm font-medium ${item.done ? "line-through" : ""}`}
                  >
                    {item.title}
                  </span>
                  <span className="text-ink-500 block text-xs">
                    {item.time ? `${item.time} · ` : ""}
                    {item.subtitle}
                    {item.done ? " · Completed" : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
