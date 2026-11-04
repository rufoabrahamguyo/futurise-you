import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { ButtonLink } from "@/components/Button";
import { Sparkline } from "@/components/charts";
import { EmptyState, ErrorState, Skeleton } from "@/components/Feedback";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/features/auth/hooks";
import { StatusBadge } from "@/features/applications/StatusControl";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";

const TILES: {
  key: keyof DashboardSummary["counts"];
  label: string;
  icon: IconName;
  to: string;
}[] = [
  { key: "total", label: "Total applications", icon: "briefcase", to: "/applications" },
  {
    key: "in_progress",
    label: "In progress",
    icon: "clock",
    to: "/applications?status=preparing,applied,assessment",
  },
  { key: "interviews", label: "Interviewing", icon: "user", to: "/applications?status=interview" },
  { key: "offers", label: "Offers", icon: "check", to: "/applications?status=offer" },
  { key: "rejections", label: "Rejections", icon: "x", to: "/applications?status=rejected" },
  { key: "follow_ups_due", label: "Follow-ups due this week", icon: "bell", to: "/reminders" },
];

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
  });
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const user = useCurrentUser();
  const dashboard = useDashboard();
  const firstName = user.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description="Here's where your job search stands."
        actions={
          <ButtonLink to="/applications/new" variant="primary" icon="plus">
            Add application
          </ButtonLink>
        }
      />
      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <div className="card">
          <ErrorState
            message={errorMessage(dashboard.error)}
            onRetry={() => void dashboard.refetch()}
          />
        </div>
      ) : dashboard.data.counts.total === 0 ? (
        <div className="card">
          <EmptyState
            icon="briefcase"
            title="Your vault is empty"
            action={
              <ButtonLink to="/applications/new" variant="primary" icon="plus">
                Add your first application
              </ButtonLink>
            }
          >
            Add a job you&apos;re applying for. Keep its description, the exact files you send, and
            everything that happens next — all in one record.
          </EmptyState>
        </div>
      ) : (
        <DashboardContent data={dashboard.data} timeZone={user.timezone} />
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((t) => (
          <Skeleton key={t.key} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function DashboardContent({ data, timeZone }: { data: DashboardSummary; timeZone: string }) {
  const activity = data.activity.map((d) => ({
    label: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${d.date}T00:00:00Z`)),
    value: d.count,
  }));
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <Link
              to={tile.to}
              className="card hover:border-pine-200 flex h-full flex-col p-4 transition-colors"
            >
              <span className="text-ink-500 flex items-center gap-1.5 text-xs font-medium">
                <Icon name={tile.icon} className="size-3.5" />
                {tile.label}
              </span>
              <span className="text-ink-900 mt-2 text-3xl font-semibold">
                {data.counts[tile.key]}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-labelledby="recent-heading">
          <div className="border-line flex items-center justify-between border-b px-5 py-4">
            <h2 id="recent-heading" className="font-sans text-base font-semibold tracking-normal">
              Recently updated
            </h2>
            <Link to="/applications" className="text-pine-700 text-sm font-medium hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-line divide-y">
            {data.recent.map((app) => (
              <li key={app.id}>
                <Link
                  to={`/applications/${app.id}`}
                  className="hover:bg-paper flex items-center gap-4 px-5 py-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-900 block truncate text-sm font-medium">
                      {app.job_title}
                    </span>
                    <span className="text-ink-500 block truncate text-xs">{app.company.name}</span>
                  </span>
                  <StatusBadge status={app.status} />
                  <span className="text-ink-500 hidden w-24 text-right text-xs sm:block">
                    {formatRelative(app.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="upcoming-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="upcoming-heading"
                className="font-sans text-base font-semibold tracking-normal"
              >
                Upcoming reminders
              </h2>
              <Link to="/reminders" className="text-pine-700 text-sm font-medium hover:underline">
                All
              </Link>
            </div>
            {data.upcoming_reminders.length === 0 ? (
              <p className="text-ink-500 py-4 text-sm">
                No upcoming reminders. Set a follow-up from any application.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.upcoming_reminders.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <Icon name="bell" className="text-pine-700 mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <Link
                        to={`/applications/${r.application.id}?tab=reminders`}
                        className="text-ink-900 block truncate text-sm font-medium hover:underline"
                      >
                        {r.title}
                      </Link>
                      <p className="text-ink-500 truncate text-xs">
                        {r.application.company_name} · {formatDateTime(r.remind_at, timeZone)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-5" aria-labelledby="activity-heading">
            <h2
              id="activity-heading"
              className="mb-1 font-sans text-base font-semibold tracking-normal"
            >
              Activity, last 14 days
            </h2>
            <Sparkline
              points={activity}
              label="Timeline entries per day over the last 14 days"
              valueLabel="entries"
            />
          </section>
        </div>
      </div>
    </>
  );
}
