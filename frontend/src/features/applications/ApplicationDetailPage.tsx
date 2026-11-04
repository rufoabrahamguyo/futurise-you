import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { Button } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorState, Skeleton } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { TabPanel, Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Application } from "@/lib/types";

import { ApplicationForm } from "./ApplicationForm";
import { useApplication, useDeleteApplication, useUpdateApplication } from "./api";
import { CompletenessPanel } from "./Completeness";
import { OverviewTab } from "./OverviewTab";
import { StatusSelect, useStatusChanger } from "./StatusControl";

const TABS = [{ id: "overview", label: "Overview" }];

export function ApplicationDetailPage() {
  const { id = "" } = useParams();
  const app = useApplication(id);

  if (app.isPending) {
    return (
      <div role="status" aria-label="Loading application" className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-8 h-80 w-full rounded-xl" />
      </div>
    );
  }
  if (app.isError) {
    const missing = app.error instanceof ApiError && app.error.status === 404;
    return (
      <div className="card">
        {missing ? (
          <ErrorState message="This application doesn't exist, or it was deleted." />
        ) : (
          <ErrorState message={errorMessage(app.error)} onRetry={() => void app.refetch()} />
        )}
      </div>
    );
  }
  return <ApplicationRecord app={app.data} />;
}

function ApplicationRecord({ app }: { app: Application }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab"))
    ? (params.get("tab") as string)
    : "overview";
  const changer = useStatusChanger();
  const update = useUpdateApplication(app.id);
  const remove = useDeleteApplication();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link
          to="/applications"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"
        >
          <Icon name="arrowLeft" className="size-3.5" /> My Applications
        </Link>
      </nav>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-ink-900 text-2xl font-semibold break-words sm:text-3xl">
            {app.job_title}
          </h1>
          <p className="text-ink-700 mt-1">
            {app.company.name}
            {app.location ? <span className="text-ink-500"> · {app.location}</span> : null}
          </p>
          {app.submitted_at ? (
            <p className="text-pine-800 mt-2 inline-flex items-center gap-1.5 text-sm">
              <Icon name="lock" className="size-3.5" />
              Submitted {formatDate(app.date_applied ?? app.submitted_at)} — files are locked as
              sent
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect app={app} onChange={(s) => changer.request(app, s)} />
          <Button icon="pencil" onClick={() => setEditing(true)}>
            Edit details
          </Button>
          <Button
            variant="ghost"
            icon="trash"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete application"
          >
            <span className="sm:hidden">Delete</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <Tabs
            tabs={TABS}
            active={tab}
            onChange={(t) => setParams({ tab: t }, { replace: true })}
            label="Application record"
            idPrefix="app"
          />
          <TabPanel id={tab} idPrefix="app">
            {tab === "overview" ? <OverviewTab app={app} /> : null}
          </TabPanel>
        </div>
        <aside className="order-first xl:order-none">
          <CompletenessPanel value={app.completeness} />
        </aside>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit details" size="lg">
        <ApplicationForm
          initial={app}
          showNotes={false}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await update.mutateAsync(input);
            toast.show("Details saved.");
            setEditing(false);
          }}
        />
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this application?"
        confirmLabel="Delete application"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(app.id, {
            onSuccess: () => {
              toast.show("Application moved to Recently deleted. You can restore it for 30 days.");
              void navigate("/applications");
            },
            onError: (e) => toast.show(errorMessage(e), "error"),
          })
        }
      >
        “{app.job_title}” at {app.company.name} will move to Recently deleted. You can restore it
        for 30 days; after that it&apos;s permanently removed, along with any files only it uses.
      </ConfirmDialog>
      {changer.dialog}
    </>
  );
}
