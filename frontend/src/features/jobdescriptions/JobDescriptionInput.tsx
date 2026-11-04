import { useState } from "react";

import { Button } from "@/components/Button";
import { Field, FormError, Textarea } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Icon } from "@/components/Icon";
import { ApiError, errorMessage } from "@/lib/api";

export type JdInput = { text: string } | { file: File };

/** Paste-or-upload control used on the Add Application page and the Job Description tab. */
export function JobDescriptionInput({
  mode,
  onModeChange,
  value,
  onChange,
  error,
}: {
  mode: "paste" | "upload";
  onModeChange: (mode: "paste" | "upload") => void;
  value: { text: string; file: File | null };
  onChange: (value: { text: string; file: File | null }) => void;
  error?: string | null;
}) {
  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="How do you want to add the job description?"
        className="grid gap-2 sm:grid-cols-2"
      >
        {(
          [
            { id: "paste", label: "Paste text", icon: "note", hint: "Copy it from the listing" },
            { id: "upload", label: "Upload a file", icon: "upload", hint: "PDF or DOCX" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            onClick={() => onModeChange(option.id)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              mode === option.id
                ? "border-pine-600 bg-pine-50 ring-pine-600 ring-1"
                : "border-line-strong bg-surface hover:bg-paper"
            }`}
          >
            <Icon name={option.icon} className="text-pine-700 size-5" />
            <span>
              <span className="text-ink-900 block text-sm font-medium">{option.label}</span>
              <span className="text-ink-500 block text-xs">{option.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === "paste" ? (
        <Field label="Job description text" error={error ?? undefined}>
          {(a) => (
            <Textarea
              {...a}
              rows={12}
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              placeholder="Paste the full job description, including requirements and how to apply."
              className="font-mono text-[13px]"
            />
          )}
        </Field>
      ) : (
        <FileDrop
          label="Job description file"
          accept=".pdf,.docx"
          hint="PDF or DOCX, up to 10 MB. We keep the original file unchanged."
          file={value.file}
          onChange={(file) => onChange({ ...value, file })}
          error={error ?? undefined}
        />
      )}
    </div>
  );
}

export function SaveJobDescriptionForm({
  onSave,
}: {
  onSave: (input: JdInput) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [value, setValue] = useState<{ text: string; file: File | null }>({ text: "", file: null });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setFormError(null);
    if (mode === "paste" && value.text.trim().length < 20)
      return setError("Paste the full job description (at least a few lines).");
    if (mode === "upload" && !value.file) return setError("Choose a PDF or DOCX file.");
    setSaving(true);
    try {
      await onSave(mode === "paste" ? { text: value.text } : { file: value.file as File });
    } catch (e) {
      const fields = e instanceof ApiError ? e.fieldErrors() : {};
      const fieldMessage = fields.text ?? fields.file;
      if (fieldMessage) setError(fieldMessage);
      else setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormError message={formError} />
      <JobDescriptionInput
        mode={mode}
        onModeChange={setMode}
        value={value}
        onChange={setValue}
        error={error}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-500 text-xs">
          The original is saved permanently and can&apos;t be replaced later.
        </p>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save job description
        </Button>
      </div>
    </div>
  );
}
