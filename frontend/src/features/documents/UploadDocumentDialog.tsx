import { useState } from "react";

import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, FormError, Input, Select } from "@/components/Field";
import { acceptFor, FileDrop } from "@/components/FileDrop";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api";
import { useMeta } from "@/lib/meta";

import { useCreateDocument } from "./api";

export function UploadDocumentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const meta = useMeta();
  const create = useCreateDocument();
  const toast = useToast();
  const [type, setType] = useState("cv");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { accept, hint } = acceptFor(type, meta.data?.image_document_types ?? []);

  function close() {
    setTitle("");
    setFile(null);
    setErrors({});
    setFormError(null);
    create.reset();
    onClose();
  }

  async function submit() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the document a name, e.g. “Product Designer CV”.";
    if (!file) next.file = "Choose a file to upload.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !file) return;
    try {
      const doc = await create.mutateAsync({ title: title.trim(), type, file });
      toast.show(`Uploaded “${doc.title}” as version 1.`);
      close();
      onCreated?.(doc.id);
    } catch (error) {
      const fields = error instanceof ApiError ? error.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(error));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload a document"
      description="It's stored privately. Uploading a newer file later creates a new version; this one is never overwritten."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => void submit()}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={formError} />
        <Field label="Type">
          {(a) => (
            <Select {...a} value={type} onChange={(e) => setType(e.target.value)}>
              {meta.data?.document_types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name" error={errors.title}>
          {(a) => (
            <Input
              {...a}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product Designer CV"
            />
          )}
        </Field>
        <FileDrop
          label="File"
          accept={accept}
          hint={hint}
          file={file}
          error={errors.file}
          onChange={(f) => {
            setFile(f);
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
          }}
        />
      </div>
    </Dialog>
  );
}
