import { useState } from "react";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useMeta } from "@/lib/meta";
import type { LibraryDocument } from "@/lib/types";

import { useDocuments } from "./api";
import { DocumentDrawer } from "./DocumentDrawer";
import { UploadDocumentDialog } from "./UploadDocumentDialog";

export function DocumentLibraryPage() {
  const meta = useMeta();
  const [archived, setArchived] = useState(false);
  const docs = useDocuments(archived ? { archived: "1", include_non_master: "1" } : {});
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = (meta.data?.document_types ?? [])
    .map((type) => ({
      type,
      items: (docs.data?.results ?? []).filter((d) => d.type === type.value),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Document Library"
        description="Your master CVs, cover letters and certificates. Every upload is kept as its own version."
        actions={
          <Button variant="primary" icon="upload" onClick={() => setUploading(true)}>
            Upload document
          </Button>
        }
      />
      <div
        role="group"
        aria-label="Show"
        className="border-line-strong bg-surface mb-5 inline-flex rounded-lg border p-0.5"
      >
        {[
          { value: false, label: "Active" },
          { value: true, label: "Archived" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={archived === option.value}
            onClick={() => setArchived(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${archived === option.value ? "bg-pine-800 text-white" : "text-ink-700 hover:bg-paper"}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {docs.isPending ? (
        <div
          role="status"
          aria-label="Loading documents"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : docs.isError ? (
        <div className="card">
          <ErrorState message={errorMessage(docs.error)} onRetry={() => void docs.refetch()} />
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          {archived ? (
            <EmptyState icon="archive" title="No archived documents">
              Documents you archive appear here. Files used by an application always stay available
              from that application.
            </EmptyState>
          ) : (
            <EmptyState
              icon="folder"
              title="Your library is empty"
              action={
                <Button variant="primary" icon="upload" onClick={() => setUploading(true)}>
                  Upload your CV
                </Button>
              }
            >
              Upload a master CV or cover letter once, then attach the exact version you send to
              each application.
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.type.value} aria-labelledby={`group-${group.type.value}`}>
              <h2
                id={`group-${group.type.value}`}
                className="text-ink-700 mb-3 font-sans text-sm font-semibold tracking-normal"
              >
                {group.type.label}{" "}
                <span className="text-ink-500 font-normal">({group.items.length})</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} onOpen={() => setOpenId(doc.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <UploadDocumentDialog
        open={uploading}
        onClose={() => setUploading(false)}
        onCreated={(id) => setOpenId(id)}
      />
      <DocumentDrawer documentId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function DocumentCard({ doc, onOpen }: { doc: LibraryDocument; onOpen: () => void }) {
  const v = doc.latest_version;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="card hover:border-pine-200 flex h-full w-full flex-col p-4 text-left transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className="bg-pine-50 text-pine-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Icon name="file" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-900 block truncate font-medium">{doc.title}</span>
            <span className="text-ink-500 block truncate text-xs">{v?.original_filename}</span>
          </span>
        </div>
        <div className="text-ink-500 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="bg-ink-900/[0.06] text-ink-700 rounded-full px-2 py-0.5 font-medium">
            v{v?.version_number ?? 1}
          </span>
          <span>
            {doc.version_count} version{doc.version_count === 1 ? "" : "s"}
          </span>
          <span>Updated {formatDate(v?.created_at ?? doc.updated_at)}</span>
          {doc.application_count ? (
            <span>
              Used in {doc.application_count} application{doc.application_count === 1 ? "" : "s"}
            </span>
          ) : null}
          {!doc.is_master ? <span className="italic">Uploaded for one application</span> : null}
        </div>
      </button>
    </li>
  );
}
