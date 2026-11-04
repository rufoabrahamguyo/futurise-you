import { useState } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorState, Skeleton } from "@/components/Feedback";
import { Field, Input } from "@/components/Field";
import { acceptFor, FileDrop } from "@/components/FileDrop";
import { FilePreview } from "@/components/FilePreview";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { labelFor, useMeta } from "@/lib/meta";
import type { DocumentVersion, LibraryDocumentDetail } from "@/lib/types";

import {
  downloadFile,
  getDownloadLink,
  useArchiveDocument,
  useDocument,
  useRenameDocument,
  useUploadVersion,
  versionDownloadPath,
} from "./api";

/** Version history, usage, preview, new version, rename and archive for one document. */
export function DocumentDrawer({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const doc = useDocument(documentId);
  return (
    <Dialog
      open={documentId !== null}
      onClose={onClose}
      title={doc.data?.title ?? "Document"}
      size="lg"
    >
      {doc.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : doc.isError ? (
        <ErrorState message={errorMessage(doc.error)} onRetry={() => void doc.refetch()} />
      ) : (
        <DocumentDetail doc={doc.data} onClose={onClose} />
      )}
    </Dialog>
  );
}

function DocumentDetail({ doc, onClose }: { doc: LibraryDocumentDetail; onClose: () => void }) {
  const meta = useMeta();
  const toast = useToast();
  const upload = useUploadVersion();
  const rename = useRenameDocument();
  const archive = useArchiveDocument();
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [title, setTitle] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentVersion | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archived = doc.archived_at !== null;
  const { accept, hint } = acceptFor(doc.type, meta.data?.image_document_types ?? []);

  async function uploadVersion() {
    if (!file) return;
    setUploadError(undefined);
    try {
      const v = await upload.mutateAsync({ documentId: doc.id, file });
      toast.show(`Uploaded version ${v.version_number}. Earlier versions are unchanged.`);
      setFile(null);
    } catch (error) {
      setUploadError(errorMessage(error));
    }
  }

  async function download(v: DocumentVersion) {
    try {
      await downloadFile(versionDownloadPath(v.id));
    } catch (error) {
      toast.show(errorMessage(error), "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="pine">{labelFor(meta.data?.document_types, doc.type)}</Badge>
        {archived ? <Badge icon="archive">Archived {formatDate(doc.archived_at)}</Badge> : null}
        {!doc.is_master ? <Badge>Uploaded for one application</Badge> : null}
      </div>

      {!archived ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title === null || !title.trim() || title === doc.title) return;
            rename.mutate(
              { id: doc.id, title: title.trim() },
              {
                onSuccess: () => toast.show("Renamed."),
                onError: (err) => toast.show(errorMessage(err), "error"),
              },
            );
          }}
        >
          <Field label="Name" className="flex-1">
            {(a) => (
              <Input {...a} value={title ?? doc.title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
          <Button
            type="submit"
            loading={rename.isPending}
            disabled={title === null || title === doc.title}
          >
            Rename
          </Button>
        </form>
      ) : null}

      <section aria-labelledby="versions-heading">
        <h3 id="versions-heading" className="text-ink-900 mb-2 text-sm font-semibold">
          Version history
        </h3>
        <ol className="divide-line border-line divide-y rounded-lg border">
          {doc.versions.map((v, index) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="text-ink-900 w-10 text-sm font-semibold">v{v.version_number}</span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-900 block truncate text-sm">{v.original_filename}</span>
                <span className="text-ink-500 block text-xs">
                  {formatDate(v.created_at)} · {formatBytes(v.size)}
                  {index === 0 ? " · Latest" : ""}
                </span>
              </span>
              <span className="flex gap-1">
                {v.previewable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="eye"
                    onClick={() => setPreview(v)}
                    aria-label={`Preview version ${v.version_number}`}
                  >
                    <span className="hidden sm:inline">Preview</span>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon="download"
                  onClick={() => void download(v)}
                  aria-label={`Download version ${v.version_number}`}
                >
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {!archived ? (
        <section aria-labelledby="new-version-heading" className="space-y-3">
          <h3 id="new-version-heading" className="text-ink-900 text-sm font-semibold">
            Upload a new version
          </h3>
          <FileDrop
            label="New file"
            accept={accept}
            hint={hint}
            file={file}
            onChange={setFile}
            error={uploadError}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              icon="upload"
              disabled={!file}
              loading={upload.isPending}
              onClick={() => void uploadVersion()}
            >
              Upload as version {(doc.versions[0]?.version_number ?? 0) + 1}
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="usage-heading">
        <h3 id="usage-heading" className="text-ink-900 mb-2 text-sm font-semibold">
          Used in applications
        </h3>
        {doc.usages.length === 0 ? (
          <p className="text-ink-500 text-sm">Not attached to any application yet.</p>
        ) : (
          <ul className="space-y-2">
            {doc.usages.map((u) => (
              <li
                key={`${u.application_id}-${u.version_number}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Link
                  to={`/applications/${u.application_id}?tab=documents`}
                  className="text-pine-700 font-medium hover:underline"
                  onClick={onClose}
                >
                  {u.job_title}
                </Link>
                <span className="text-ink-500">at {u.company_name}</span>
                <Badge>v{u.version_number}</Badge>
                {u.is_frozen ? (
                  <Badge tone="pine" icon="lock">
                    Submitted version
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!archived ? (
        <div className="border-line border-t pt-4">
          <Button variant="ghost" icon="archive" onClick={() => setConfirmArchive(true)}>
            Archive document
          </Button>
        </div>
      ) : null}

      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${doc.title} — v${preview.version_number}` : ""}
        size="xl"
      >
        {preview ? (
          <FilePreview
            key={preview.id}
            title={preview.original_filename}
            getUrl={() => getDownloadLink(versionDownloadPath(preview.id), true)}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        title="Archive this document?"
        confirmLabel="Archive"
        loading={archive.isPending}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() =>
          archive.mutate(doc.id, {
            onSuccess: () => {
              toast.show("Document archived.");
              setConfirmArchive(false);
              onClose();
            },
            onError: (e) => toast.show(errorMessage(e), "error"),
          })
        }
      >
        It leaves your library. Any version already attached to an application stays available from
        that application.
      </ConfirmDialog>
    </div>
  );
}
