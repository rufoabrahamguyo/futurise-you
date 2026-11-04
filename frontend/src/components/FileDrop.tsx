import { useId, useRef, useState, type DragEvent } from "react";

import { formatBytes } from "@/lib/format";

import { Icon } from "./Icon";

interface Props {
  label: string;
  accept: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** File picker with drag and drop. The native input stays keyboard-accessible. */
export function FileDrop({ label, accept, hint, file, onChange, error }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tooBig = file !== null && file.size > MAX_BYTES;
  const message = error ?? (tooBig ? "Files must be 10 MB or smaller." : undefined);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  }

  return (
    <div>
      <span className="text-ink-700 mb-1.5 block text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`focus-within:outline-pine-600 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 ${
          over
            ? "border-pine-600 bg-pine-50"
            : message
              ? "border-rose-ink/60"
              : "border-line-strong hover:border-pine-200 hover:bg-paper"
        }`}
      >
        <Icon name={file ? "file" : "upload"} className="text-pine-700 size-6" />
        {file ? (
          <span className="mt-2 text-sm">
            <span className="text-ink-900 font-medium">{file.name}</span>
            <span className="text-ink-500"> · {formatBytes(file.size)}</span>
          </span>
        ) : (
          <span className="text-ink-700 mt-2 text-sm">
            <span className="text-pine-700 font-medium">Choose a file</span> or drag it here
          </span>
        )}
        <span className="text-ink-500 mt-1 text-xs">{hint}</span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          aria-labelledby={`${id}-label`}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-rose-ink mt-1.5 text-xs font-medium">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function acceptFor(type: string, imageTypes: string[]): { accept: string; hint: string } {
  const images = imageTypes.includes(type);
  return images
    ? { accept: ".pdf,.docx,.png,.jpg,.jpeg", hint: "PDF, DOCX, PNG or JPG, up to 10 MB" }
    : {
        accept: ".pdf,.docx",
        hint: "PDF or DOCX, up to 10 MB. Legacy .doc files aren't supported.",
      };
}
