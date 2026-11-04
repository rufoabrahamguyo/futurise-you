import { Link } from "react-router";

import { Button, ButtonLink } from "@/components/Button";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/format";

import { type ApplicationFilters, useApplications, useRestoreApplication } from "./api";
import { CompletenessMeter } from "./Completeness";
import { StatusSelect, useStatusChanger } from "./StatusControl";

const COLUMNS: { key: string; label: string; className?: string }[] = [
  { key: "company", label: "Company" },
  { key: "title", label: "Position" },
  { key: "status", label: "Status" },
  { key: "deadline", label: "Deadline", className: "hidden md:table-cell" },
  { key: "record", label: "Record", className: "hidden lg:table-cell" },
  { key: "updated", label: "Last updated", className: "hidden sm:table-cell" },
];

const SORTABLE = new Set(["company", "title", "status", "deadline", "updated"]);

interface Props {
  filters: ApplicationFilters;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  onPageChange: (page: number) => void;
  trash: boolean;
}

export function ApplicationTable({
  filters,
  ordering,
  onOrderingChange,
  onPageChange,
  trash,
}: Props) {
  const apps = useApplications(filters);
  const changer = useStatusChanger();
  const restore = useRestoreApplication();
  const toast = useToast();
  const page = filters.page ?? 1;

  function sortFor(key: string): "ascending" | "descending" | "none" {
    const base = ordering.replace(/^-/, "");
    if (base !== key) return "none";
    // "updated" sorts newest first by default.
    const descending = key === "updated" ? !ordering.startsWith("-") : ordering.startsWith("-");
    return descending ? "descending" : "ascending";
  }

  function toggle(key: string) {
    const current = sortFor(key);
    if (key === "updated") onOrderingChange(current === "descending" ? "-updated" : "updated");
    else onOrderingChange(current === "ascending" ? `-${key}` : key);
  }

  if (apps.isPending) return <SkeletonRows rows={6} label="Loading applications" />;
  if (apps.isError) {
    return (
      <div className="card">
        <ErrorState message={errorMessage(apps.error)} onRetry={() => void apps.refetch()} />
      </div>
    );
  }
  const { results, count } = apps.data;
  const filtered = Boolean(
    filters.q || filters.status || filters.work_arrangement || filters.employment_type,
  );
  if (count === 0) {
    return (
      <div className="card">
        {trash ? (
          <EmptyState icon="trash" title="Nothing deleted">
            Applications you delete appear here for 30 days.
          </EmptyState>
        ) : filtered ? (
          <EmptyState icon="search" title="No applications match">
            Try a different search or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState
            icon="briefcase"
            title="No applications yet"
            action={
              <ButtonLink to="/applications/new" variant="primary" icon="plus">
                Add your first application
              </ButtonLink>
            }
          >
            Every job you apply for gets its own permanent record.
          </EmptyState>
        )}
      </div>
    );
  }

  const pages = Math.ceil(count / 25);

  return (
    <div className={`card overflow-hidden ${apps.isPlaceholderData ? "opacity-60" : ""}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            {trash ? "Deleted applications" : "Applications"}, {count} total
          </caption>
          <thead className="border-line bg-paper/60 text-ink-500 border-b text-xs">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={SORTABLE.has(col.key) ? sortFor(col.key) : undefined}
                  className={`px-4 py-2.5 font-medium ${col.className ?? ""}`}
                >
                  {SORTABLE.has(col.key) ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className="hover:text-ink-900 inline-flex items-center gap-1 rounded"
                    >
                      {col.label}
                      <Icon
                        name="chevronDown"
                        className={`size-3 transition-transform ${sortFor(col.key) === "none" ? "opacity-0" : ""} ${sortFor(col.key) === "ascending" ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {trash ? (
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {results.map((app) => (
              <tr key={app.id} className="hover:bg-paper/60">
                <td className="text-ink-900 px-4 py-3 font-medium">{app.company.name}</td>
                <td className="px-4 py-3">
                  {trash ? (
                    <span className="text-ink-700">{app.job_title}</span>
                  ) : (
                    <Link
                      to={`/applications/${app.id}`}
                      className="text-pine-800 font-medium hover:underline"
                    >
                      {app.job_title}
                    </Link>
                  )}
                  {app.location ? (
                    <span className="text-ink-500 block text-xs">{app.location}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {trash ? (
                    app.status
                  ) : (
                    <StatusSelect app={app} size="sm" onChange={(s) => changer.request(app, s)} />
                  )}
                </td>
                <td className="text-ink-700 hidden px-4 py-3 md:table-cell">
                  {app.deadline ? (
                    formatDate(app.deadline)
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <CompletenessMeter value={app.completeness} />
                </td>
                <td className="text-ink-500 hidden px-4 py-3 sm:table-cell">
                  {formatRelative(trash && app.deleted_at ? app.deleted_at : app.updated_at)}
                </td>
                {trash ? (
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      icon="refresh"
                      loading={restore.isPending && restore.variables === app.id}
                      onClick={() =>
                        restore.mutate(app.id, {
                          onSuccess: () => toast.show(`Restored “${app.job_title}”.`),
                          onError: (e) => toast.show(errorMessage(e), "error"),
                        })
                      }
                    >
                      Restore
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav
          aria-label="Pagination"
          className="border-line flex items-center justify-between border-t px-4 py-3 text-sm"
        >
          <span className="text-ink-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              icon="chevronLeft"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
              Next
            </Button>
          </div>
        </nav>
      ) : null}
      {changer.dialog}
    </div>
  );
}
