import { useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "@/components/Feedback";
import { Field, FormError, Input, Select } from "@/components/Field";
import { acceptFor, FileDrop } from "@/components/FileDrop";
import { FilePreview } from "@/components/FilePreview";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import {
  downloadFile,
  getDownloadLink,
  useApplicationDocuments,
  useAttachVersion,
  useDetachDocument,
  useDocument,
  useDocuments,
  useUploadAttachment,
  versionDownloadPath,
} from "@/features/documents/api";
import { useCurrentUser } from "@/features/auth/hooks";
import { ApiError, errorMessage } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type { Application, ApplicationDocumentLink } from "@/lib/types";

export function DocumentsTab({ app }: { app: Application }) {
  const links = useApplicationDocuments(app.id);
  const [attaching, setAttaching] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (links.isPending) return <SkeletonRows rows={3} label="Loading documents" />;
  if (links.isError)
    return <ErrorState message={errorMessage(links.error)} onRetry={() => void links.refetch()} />;

  const submitted = links.data.filter((l) => l.is_frozen);
  const after = links.data.filter((l) => l.added_after_submission);
  const pending = links.data.filter((l) => !l.is_frozen && !l.added_after_submission);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-500 text-sm">
          {app.submitted_at
            ? "These are the exact files you sent. They can't be changed or removed."
            : "Attach the exact versions you're sending. They're locked when you mark the application as Applied."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button icon="folder" onClick={() => setAttaching(true)}>
            Attach from library
          </Button>
          <Button icon="upload" onClick={() => setUploading(true)}>
            Upload a file
          </Button>
        </div>
      </div>

      {links.data.length === 0 ? (
        <div className="card">
          <EmptyState icon="file" title="No documents attached yet" compact>
            Attach the CV and cover letter you&apos;re sending so this record shows exactly what the
            employer received.
          </EmptyState>
        </div>
      ) : null}

      {app.submitted_at ? (
        <DocumentSection
          title="Submitted with this application"
          description={`Locked on ${formatDate(app.date_applied ?? app.submitted_at)}.`}
          links={submitted}
          app={app}
          empty="No files were attached when this application was submitted."
        />
      ) : null}
      {after.length > 0 ? (
        <DocumentSection
          title="Added after submission"
          description="These were not part of the original submission."
          links={after}
          app={app}
        />
      ) : null}
      {!app.submitted_at && pending.length > 0 ? (
        <>
          {!pending.some((l) => l.role === "cv") ? (
            <Notice tone="warning" title="No CV attached">
              Attach the CV you&apos;re sending before you mark this application as Applied.
            </Notice>
          ) : null}
          <DocumentSection
            title="Attached"
            description="Not yet submitted."
            links={pending}
            app={app}
          />
        </>
      ) : null}

      <AttachFromLibraryDialog
        open={attaching}
        onClose={() => setAttaching(false)}
        app={app}
        attached={links.data}
      />
      <UploadAttachmentDialog open={uploading} onClose={() => setUploading(false)} app={app} />
    </div>
  );
}

function DocumentSection({
  title,
  description,
  links,
  app,
  empty,
}: {
  title: string;
  description: string;
  links: ApplicationDocumentLink[];
  app: Application;
  empty?: string;
}) {
  return (
    <section aria-label={title} className="card">
      <header className="border-line border-b px-5 py-3">
        <h2 className="text-ink-900 font-sans text-sm font-semibold tracking-normal">{title}</h2>
        <p className="text-ink-500 text-xs">{description}</p>
      </header>
      {links.length === 0 ? (
        <p className="text-ink-500 px-5 py-4 text-sm">{empty}</p>
      ) : (
        <ul className="divide-line divide-y">
          {links.map((link) => (
            <DocumentRow key={link.id} link={link} app={app} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentRow({ link, app }: { link: ApplicationDocumentLink; app: Application }) {
  const meta = useMeta();
  const user = useCurrentUser();
  const toast = useToast();
  const detach = useDetachDocument(app.id);
  const [previewing, setPreviewing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const v = link.version;
  const newer =
    link.latest_version_number !== null && link.latest_version_number > v.version_number;

  async function download() {
    try {
      await downloadFile(versionDownloadPath(v.id));
    } catch (error) {
      toast.show(errorMessage(error), "error");
    }
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <span
        className="bg-pine-50 text-pine-700 flex size-10 shrink-0 items-center justify-center rounded-lg"
        aria-hidden="true"
      >
        <Icon name={link.is_frozen ? "lock" : "file"} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-900 font-medium">{link.document_title}</span>
          <Badge>{labelFor(meta.data?.document_types, link.role)}</Badge>
          {link.is_frozen && link.frozen_at ? (
            <Badge tone="pine" icon="lock">
              Submitted version · {formatDateTime(link.frozen_at, user.timezone)}
            </Badge>
          ) : null}
          {link.added_after_submission ? <Badge tone="amber">Added after submission</Badge> : null}
        </div>
        <p className="text-ink-500 mt-0.5 truncate text-xs">
          {v.original_filename} · version {v.version_number} · {formatBytes(v.size)}
          {link.document_archived ? " · archived from library" : ""}
        </p>
        {newer ? (
          <p className="text-ink-500 mt-0.5 text-xs">
            Your library now has version {link.latest_version_number}; this record keeps version{" "}
            {v.version_number}.
          </p>
        ) : null}
      </div>
      <div className="flex gap-1">
        {v.previewable ? (
          <Button size="sm" variant="ghost" icon="eye" onClick={() => setPreviewing(true)}>
            Preview
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon="download" onClick={() => void download()}>
          Download
        </Button>
        {!link.is_frozen ? (
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            onClick={() => setConfirmRemove(true)}
            aria-label={`Remove ${link.document_title}`}
          />
        ) : null}
      </div>
      <Dialog
        open={previewing}
        onClose={() => setPreviewing(false)}
        title={`${link.document_title} — version ${v.version_number}`}
        size="xl"
      >
        {previewing ? (
          <FilePreview
            title={v.original_filename}
            getUrl={() => getDownloadLink(versionDownloadPath(v.id), true)}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this file from the application?"
        confirmLabel="Remove"
        tone="danger"
        loading={detach.isPending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() =>
          detach.mutate(link.id, {
            onSuccess: () => {
              setConfirmRemove(false);
              toast.show("File removed from this application.");
            },
            onError: (error) => {
              setConfirmRemove(false);
              const frozen = error instanceof ApiError && error.status === 409;
              toast.show(
                frozen ? "This file was submitted and can't be removed." : errorMessage(error),
                "error",
              );
            },
          })
        }
      >
        The file stays in your library; it&apos;s only unlinked from this application.
      </ConfirmDialog>
    </li>
  );
}

function AttachFromLibraryDialog({
  open,
  onClose,
  app,
  attached,
}: {
  open: boolean;
  onClose: () => void;
  app: Application;
  attached: ApplicationDocumentLink[];
}) {
  const meta = useMeta();
  const toast = useToast();
  const docs = useDocuments();
  const attach = useAttachVersion(app.id);
  const [documentId, setDocumentId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const detail = useDocument(documentId || null);
  const attachedVersions = new Set(attached.map((l) => l.version.id));

  function close() {
    setDocumentId("");
    setVersionId("");
    setRole("");
    setError(null);
    onClose();
  }

  const selectedVersion = versionId || detail.data?.versions[0]?.id || "";

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Attach from library"
      description="Choose the exact version you're sending."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selectedVersion || attachedVersions.has(selectedVersion)}
            loading={attach.isPending}
            onClick={() =>
              attach.mutate(
                {
                  document_version_id: selectedVersion,
                  role: role || detail.data?.type || "other",
                },
                {
                  onSuccess: () => {
                    toast.show(
                      app.submitted_at
                        ? "Attached. It's labelled “Added after submission”."
                        : "Attached.",
                    );
                    close();
                  },
                  onError: (e) => setError(errorMessage(e)),
                },
              )
            }
          >
            Attach
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {app.submitted_at ? (
          <Notice tone="info">
            This application was already submitted. Files you add now are labelled “Added after
            submission”.
          </Notice>
        ) : null}
        <FormError message={error} />
        {docs.data && docs.data.results.length === 0 ? (
          <p className="text-ink-500 text-sm">
            Your library is empty. Use “Upload a file” instead, or add documents in the Document
            Library.
          </p>
        ) : (
          <>
            <Field label="Document">
              {(a) => (
                <Select
                  {...a}
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setVersionId("");
                    setRole("");
                  }}
                >
                  <option value="">Choose a document…</option>
                  {meta.data?.document_types.map((t) => {
                    const items = docs.data?.results.filter((d) => d.type === t.value) ?? [];
                    return items.length ? (
                      <optgroup key={t.value} label={t.label}>
                        {items.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </Select>
              )}
            </Field>
            {detail.data ? (
              <>
                <Field
                  label="Version"
                  hint={
                    attachedVersions.has(selectedVersion)
                      ? "This version is already attached."
                      : undefined
                  }
                >
                  {(a) => (
                    <Select
                      {...a}
                      value={selectedVersion}
                      onChange={(e) => setVersionId(e.target.value)}
                    >
                      {detail.data.versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          Version {v.version_number} — {v.original_filename} (
                          {formatDate(v.created_at)}){i === 0 ? " · latest" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Role in this application">
                  {(a) => (
                    <Select
                      {...a}
                      value={role || detail.data.type}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {meta.data?.document_types.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

function UploadAttachmentDialog({
  open,
  onClose,
  app,
}: {
  open: boolean;
  onClose: () => void;
  app: Application;
}) {
  const meta = useMeta();
  const toast = useToast();
  const upload = useUploadAttachment(app.id);
  const [role, setRole] = useState("cv");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const { accept, hint } = acceptFor(role, meta.data?.image_document_types ?? []);

  function close() {
    setFile(null);
    setTitle("");
    setError(undefined);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload a file to this application"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!file}
            loading={upload.isPending}
            onClick={() => {
              if (!file) return;
              upload.mutate(
                { file, role, title: title.trim() || undefined, save_to_library: saveToLibrary },
                {
                  onSuccess: () => {
                    toast.show("File uploaded and attached.");
                    close();
                  },
                  onError: (e) => setError(errorMessage(e)),
                },
              );
            }}
          >
            Upload and attach
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role">
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value)}>
              {meta.data?.document_types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name" optional hint="Defaults to the file name.">
          {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <FileDrop
          label="File"
          accept={accept}
          hint={hint}
          file={file}
          onChange={setFile}
          error={error}
        />
        <label className="text-ink-700 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(e) => setSaveToLibrary(e.target.checked)}
            className="border-line-strong accent-pine-700 size-4 rounded"
          />
          Also keep it in my Document Library
        </label>
      </div>
    </Dialog>
  );
}
