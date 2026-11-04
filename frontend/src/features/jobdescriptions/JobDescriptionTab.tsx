import { useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { ErrorState, Notice, SkeletonRows } from "@/components/Feedback";
import { Field, FormError, Textarea } from "@/components/Field";
import { FilePreview } from "@/components/FilePreview";
import { useToast } from "@/components/Toast";
import { downloadFile, getDownloadLink } from "@/features/documents/api";
import { useCurrentUser } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { Application, JobDescription } from "@/lib/types";

import { jdFilePath, useJobDescription, useSaveJobDescription, useSupplementText } from "./api";
import { SaveJobDescriptionForm } from "./JobDescriptionInput";

export function JobDescriptionTab({ app }: { app: Application }) {
  const jd = useJobDescription(app.id);
  const save = useSaveJobDescription(app.id);
  const toast = useToast();

  if (jd.isPending) return <SkeletonRows rows={4} label="Loading job description" />;
  if (jd.isError)
    return <ErrorState message={errorMessage(jd.error)} onRetry={() => void jd.refetch()} />;
  if (!jd.data) {
    return (
      <section className="card p-5" aria-labelledby="jd-add-heading">
        <h2 id="jd-add-heading" className="font-sans text-base font-semibold tracking-normal">
          Save the job description
        </h2>
        <p className="text-ink-500 mt-1 mb-4 text-sm">
          Listings disappear. Keep the original here so you can always see exactly what you applied
          for.
        </p>
        <SaveJobDescriptionForm
          onSave={async (input) => {
            await save.mutateAsync(input);
            toast.show("Job description saved.");
          }}
        />
      </section>
    );
  }
  return (
    <div className="space-y-6">
      <OriginalRecord app={app} jd={jd.data} />
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  paste: "Pasted text",
  file: "Text extracted from the uploaded file",
  paste_supplement: "Pasted by you (the file had no text layer)",
};

export function OriginalRecord({ app, jd }: { app: Application; jd: JobDescription }) {
  const user = useCurrentUser();
  const toast = useToast();
  const [previewing, setPreviewing] = useState(false);
  const previewable = jd.original_file_mime === "application/pdf";

  return (
    <section className="card" aria-labelledby="jd-original-heading">
      <header className="border-line flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="jd-original-heading"
            className="font-sans text-base font-semibold tracking-normal"
          >
            Original job description
          </h2>
          <p className="text-ink-500 mt-0.5 text-xs">
            Saved {formatDateTime(jd.created_at, user.timezone)} · kept exactly as you provided it
          </p>
        </div>
        <Badge tone="pine" icon="lock">
          Original · unchangeable
        </Badge>
      </header>
      {jd.has_file ? (
        <div className="border-line flex flex-wrap items-center gap-3 border-b px-5 py-3 text-sm">
          <span className="text-ink-900 font-medium">{jd.original_filename}</span>
          <span className="text-ink-500">
            {jd.original_file_size ? formatBytes(jd.original_file_size) : ""}
          </span>
          <span className="ml-auto flex gap-1">
            {previewable ? (
              <Button size="sm" variant="ghost" icon="eye" onClick={() => setPreviewing(true)}>
                Preview file
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              icon="download"
              onClick={() =>
                void downloadFile(jdFilePath(app.id)).catch((e: unknown) =>
                  toast.show(errorMessage(e), "error"),
                )
              }
            >
              Download original
            </Button>
          </span>
        </div>
      ) : null}
      <div className="px-5 py-4">
        {jd.has_text ? (
          <>
            <p className="text-ink-500 mb-2 text-xs font-medium">
              {SOURCE_LABEL[jd.text_source] ?? "Text"}
            </p>
            <div
              className="border-line bg-paper/60 text-ink-900 max-h-[32rem] overflow-y-auto rounded-lg border p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
              tabIndex={0}
              aria-label="Job description text"
            >
              {jd.original_text}
            </div>
          </>
        ) : (
          <SupplementText applicationId={app.id} />
        )}
      </div>
      <Dialog
        open={previewing}
        onClose={() => setPreviewing(false)}
        title={jd.original_filename}
        size="xl"
      >
        {previewing ? (
          <FilePreview
            title={jd.original_filename}
            getUrl={() => getDownloadLink(jdFilePath(app.id), true)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

function SupplementText({ applicationId }: { applicationId: string }) {
  const supplement = useSupplementText(applicationId);
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Notice tone="warning" title="We couldn't read any text in this file">
        It may be a scanned image. The file is saved, but to use AI extraction, paste the job
        description text below. You can only do this once.
      </Notice>
      <FormError message={error} />
      <Field label="Job description text">
        {(a) => (
          <Textarea {...a} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
        )}
      </Field>
      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={supplement.isPending}
          disabled={text.trim().length < 20}
          onClick={() =>
            supplement.mutate(text, {
              onSuccess: () => toast.show("Text saved."),
              onError: (e) => setError(errorMessage(e)),
            })
          }
        >
          Save text
        </Button>
      </div>
    </div>
  );
}
