import { useState, type DragEvent } from "react";
import { Link } from "react-router";

import { ButtonLink } from "@/components/Button";
import { EmptyState, ErrorState, Notice, Skeleton } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useMeta } from "@/lib/meta";
import { statusStyle } from "@/lib/statusStyles";
import type { ApplicationSummary } from "@/lib/types";

import { type ApplicationFilters, useApplications } from "./api";
import { CompletenessMeter } from "./Completeness";
import { StatusSelect, useStatusChanger } from "./StatusControl";

const BOARD_LIMIT = 200;
const DRAG_TYPE = "application/x-applyvault-id";

/**
 * Kanban board. Drag a card between columns (native HTML5 drag and drop), or
 * use the status menu on each card from the keyboard.
 */
export function ApplicationBoard({ filters }: { filters: ApplicationFilters }) {
  const meta = useMeta();
  const apps = useApplications({ ...filters, status: undefined, page_size: BOARD_LIMIT });
  const changer = useStatusChanger();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  if (apps.isPending || meta.isPending) {
    return (
      <div role="status" aria-label="Loading board" className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }
  if (apps.isError || meta.isError) {
    return (
      <div className="card">
        <ErrorState
          message={errorMessage(apps.error ?? meta.error)}
          onRetry={() => void apps.refetch()}
        />
      </div>
    );
  }

  const all = apps.data.results;
  const filtered = Boolean(filters.q || filters.work_arrangement || filters.employment_type);
  if (apps.data.count === 0 && !filtered) {
    return (
      <div className="card">
        <EmptyState
          icon="board"
          title="Your board is empty"
          action={
            <ButtonLink to="/applications/new" variant="primary" icon="plus">
              Add your first application
            </ButtonLink>
          }
        >
          Applications appear here in a column for each status. Drag them along as things move.
        </EmptyState>
      </div>
    );
  }

  const byId = new Map(all.map((a) => [a.id, a]));

  function onDrop(event: DragEvent<HTMLElement>, status: string) {
    event.preventDefault();
    setDropTarget(null);
    setDragging(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const app = byId.get(id);
    if (app) changer.request(app, status);
  }

  return (
    <>
      {apps.data.count > BOARD_LIMIT ? (
        <div className="mb-4">
          <Notice tone="info">
            Showing the {BOARD_LIMIT} most recently updated applications. Use search or the{" "}
            <Link className="font-medium underline" to="/applications?view=table">
              table view
            </Link>{" "}
            to see the rest.
          </Notice>
        </div>
      ) : null}
      <p id="board-help" className="sr-only">
        Drag cards between columns, or use each card&apos;s status menu to move it.
      </p>
      <div
        className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8"
        aria-describedby="board-help"
      >
        {meta.data.statuses.map((status) => {
          const items = all.filter((a) => a.status === status.value);
          const isTarget = dropTarget === status.value;
          return (
            <section
              key={status.value}
              aria-label={`${status.label}, ${items.length} applications`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(status.value);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(e) => onDrop(e, status.value)}
              className={`bg-ink-900/[0.035] flex w-72 shrink-0 snap-start flex-col rounded-xl border-t-4 ${statusStyle(status.value).column} ${
                isTarget ? "ring-pine-600 ring-2" : ""
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-ink-900 font-sans text-sm font-semibold tracking-normal">
                  {status.label}
                </h2>
                <span className="bg-surface text-ink-500 rounded-full px-2 text-xs font-medium">
                  {items.length}
                </span>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                {items.map((app) => (
                  <BoardCard
                    key={app.id}
                    app={app}
                    dragging={dragging === app.id}
                    onDragStart={() => setDragging(app.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onStatusChange={(s) => changer.request(app, s)}
                  />
                ))}
                {items.length === 0 ? (
                  <li className="border-line-strong text-ink-500 rounded-lg border border-dashed px-3 py-6 text-center text-xs">
                    Drop here
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      {changer.dialog}
    </>
  );
}

interface CardProps {
  app: ApplicationSummary;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStatusChange: (status: string) => void;
}

function BoardCard({ app, dragging, onDragStart, onDragEnd, onStatusChange }: CardProps) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, app.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group card cursor-grab p-3 active:cursor-grabbing ${dragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-2">
        <Icon name="grip" className="text-ink-400 mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/applications/${app.id}`}
            className="text-ink-900 block text-sm font-semibold hover:underline"
            draggable={false}
          >
            {app.job_title}
          </Link>
          <p className="text-ink-500 truncate text-xs">{app.company.name}</p>
        </div>
      </div>
      <div className="text-ink-500 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {app.deadline ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" className="size-3" /> Due {formatDate(app.deadline)}
          </span>
        ) : null}
        {app.submitted_at ? (
          <span className="text-pine-700 inline-flex items-center gap-1">
            <Icon name="lock" className="size-3" /> Submitted
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <CompletenessMeter value={app.completeness} />
        <StatusSelect app={app} size="sm" label="Move" onChange={onStatusChange} />
      </div>
    </li>
  );
}
