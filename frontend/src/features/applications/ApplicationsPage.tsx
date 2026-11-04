import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { ButtonLink } from "@/components/Button";
import { Select } from "@/components/Field";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { useMeta } from "@/lib/meta";
import { useDebounced } from "@/lib/useDebounced";

import { ApplicationBoard } from "./ApplicationBoard";
import { ApplicationCalendar } from "./ApplicationCalendar";
import { ApplicationTable } from "./ApplicationTable";
import type { ApplicationFilters } from "./api";

type View = "table" | "board" | "calendar";

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: "board", label: "Board", icon: "board" },
  { id: "table", label: "Table", icon: "table" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
];

function isView(value: string | null): value is View {
  return value === "table" || value === "board" || value === "calendar";
}

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const view: View = isView(params.get("view")) ? (params.get("view") as View) : "board";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search.trim(), 300);

  function update(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if ((params.get("q") ?? "") !== debounced) update({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced value
  }, [debounced]);

  const filters: ApplicationFilters = {
    q: params.get("q") ?? undefined,
    status: params.get("status") ?? undefined,
    work_arrangement: params.get("work_arrangement") ?? undefined,
    employment_type: params.get("employment_type") ?? undefined,
    ordering: params.get("ordering") ?? undefined,
    trash: params.get("trash") === "1" ? "1" : undefined,
  };
  const trash = filters.trash === "1";
  const statusFilter = params.get("status") ?? "";
  const statusIsSingle =
    statusFilter === "" || meta.data?.statuses.some((s) => s.value === statusFilter);

  return (
    <>
      <PageHeader
        title={trash ? "Recently deleted" : "My Applications"}
        description={
          trash
            ? "Deleted applications can be restored for 30 days, then they're permanently removed."
            : "Every application, with its full record."
        }
        actions={
          <ButtonLink to="/applications/new" variant="primary" icon="plus">
            Add application
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="group"
          aria-label="View"
          className="border-line-strong bg-surface inline-flex shrink-0 self-start rounded-lg border p-0.5"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => update({ view: v.id })}
              disabled={trash && v.id !== "table"}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                view === v.id ? "bg-pine-800 text-white" : "text-ink-700 hover:bg-paper"
              }`}
            >
              <Icon name={v.icon} />
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Icon
            name="search"
            className="text-ink-400 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <label htmlFor="app-search" className="sr-only">
            Search applications
          </label>
          <input
            id="app-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or job title"
            className="border-line-strong bg-surface placeholder:text-ink-400 focus-visible:outline-pine-600 h-10 w-full rounded-lg border pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {view !== "board" ? (
            <FilterSelect
              label="Status"
              value={statusIsSingle ? statusFilter : ""}
              onChange={(v) => update({ status: v })}
            >
              <option value="">{statusIsSingle ? "All statuses" : "Selected statuses"}</option>
              {meta.data?.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </FilterSelect>
          ) : null}
          <FilterSelect
            label="Work arrangement"
            value={params.get("work_arrangement") ?? ""}
            onChange={(v) => update({ work_arrangement: v })}
          >
            <option value="">Any arrangement</option>
            {meta.data?.work_arrangements.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Employment type"
            value={params.get("employment_type") ?? ""}
            onChange={(v) => update({ employment_type: v })}
          >
            <option value="">Any type</option>
            {meta.data?.employment_types.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>

      {view === "board" && !trash ? (
        <ApplicationBoard filters={filters} />
      ) : view === "calendar" && !trash ? (
        <ApplicationCalendar filters={filters} />
      ) : (
        <ApplicationTable
          filters={{ ...filters, page: Number(params.get("page") ?? 1) }}
          ordering={params.get("ordering") ?? "updated"}
          onOrderingChange={(o) => update({ ordering: o })}
          onPageChange={(p) => update({ page: String(p) })}
          trash={trash}
        />
      )}

      <div className="mt-8 text-center">
        <ButtonLink
          to={trash ? "/applications?view=table" : "/applications?view=table&trash=1"}
          variant="ghost"
          size="sm"
          icon={trash ? "arrowLeft" : "trash"}
        >
          {trash ? "Back to applications" : "Recently deleted"}
        </ButtonLink>
      </div>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
  children: React.ReactNode;
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className="!w-auto min-w-36"
      >
        {children}
      </Select>
    </>
  );
}
