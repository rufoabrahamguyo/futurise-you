import { useQuery } from "@tanstack/react-query";

import { ButtonLink } from "@/components/Button";
import { BarList, ColumnChart } from "@/components/charts";
import { EmptyState, ErrorState, Skeleton } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { api, errorMessage } from "@/lib/api";
import { labelFor, useMeta } from "@/lib/meta";

interface Analytics {
  by_status: { status: string; count: number }[];
  submitted_per_week: { week_start: string; count: number }[];
  completeness: {
    percent: number;
    complete_records: number;
    total: number;
    items: { job_description: number; submitted_documents: number; history: number };
  };
}

const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

export function AnalyticsPage() {
  const meta = useMeta();
  const data = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.get<Analytics>("/analytics"),
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="A simple view of where your applications stand and how complete your records are."
      />
      {data.isPending ? (
        <div role="status" aria-label="Loading analytics" className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl lg:col-span-3" />
        </div>
      ) : data.isError ? (
        <div className="card">
          <ErrorState message={errorMessage(data.error)} onRetry={() => void data.refetch()} />
        </div>
      ) : data.data.completeness.total === 0 ? (
        <div className="card">
          <EmptyState
            icon="chart"
            title="Nothing to analyse yet"
            action={
              <ButtonLink to="/applications/new" variant="primary" icon="plus">
                Add an application
              </ButtonLink>
            }
          >
            Analytics appear once you have applications.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card p-5" aria-labelledby="completeness-stat">
            <h2
              id="completeness-stat"
              className="text-ink-500 font-sans text-sm font-medium tracking-normal"
            >
              Record completeness
            </h2>
            <p className="text-ink-900 mt-2 text-5xl font-semibold">
              {data.data.completeness.percent}%
            </p>
            <p className="text-ink-500 mt-2 text-sm">
              {data.data.completeness.complete_records} of {data.data.completeness.total}{" "}
              applications have their job description, submitted documents and history preserved.
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["Job description saved", data.data.completeness.items.job_description],
                  [
                    "Submitted documents preserved",
                    data.data.completeness.items.submitted_documents,
                  ],
                  ["History recorded", data.data.completeness.items.history],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-ink-700">{label}</dt>
                  <dd className="text-ink-900 tabular-nums">
                    {n} / {data.data.completeness.total}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card p-5 lg:col-span-2" aria-labelledby="by-status-heading">
            <h2
              id="by-status-heading"
              className="mb-4 font-sans text-base font-semibold tracking-normal"
            >
              Applications by status
            </h2>
            <BarList
              label="Number of applications in each status"
              valueLabel="applications"
              points={data.data.by_status.map((row) => ({
                label: labelFor(meta.data?.statuses, row.status),
                value: row.count,
              }))}
            />
          </section>
          <section className="card p-5 lg:col-span-3" aria-labelledby="over-time-heading">
            <h2
              id="over-time-heading"
              className="font-sans text-base font-semibold tracking-normal"
            >
              Applications submitted per week
            </h2>
            <p className="text-ink-500 mb-3 text-sm">Last 12 weeks, by date applied.</p>
            <ColumnChart
              label="Applications submitted per week over the last 12 weeks"
              valueLabel="submitted"
              points={data.data.submitted_per_week.map((w) => ({
                label: weekLabel(w.week_start),
                value: w.count,
              }))}
            />
          </section>
        </div>
      )}
    </>
  );
}
