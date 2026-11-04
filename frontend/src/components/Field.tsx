import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const CONTROL =
  "block w-full rounded-lg border bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-pine-600 disabled:bg-paper disabled:text-ink-500";

function controlClasses(invalid: boolean, extra = ""): string {
  return `${CONTROL} ${invalid ? "border-rose-ink" : "border-line-strong"} ${extra}`;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({ label, error, hint, optional, children, className = "" }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-ink-700 mb-1.5 block text-sm font-medium">
        {label}
        {optional ? <span className="text-ink-500 ml-1 font-normal">(optional)</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-ink-500 mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-rose-ink mt-1.5 text-xs font-medium" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function Input({ className = "", ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      className={controlClasses(props["aria-invalid"] === true, `h-10 ${className}`)}
      {...props}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ className = "", ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={controlClasses(
        props["aria-invalid"] === true,
        `py-2 leading-relaxed ${className}`,
      )}
      {...props}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

export function Select({ className = "", ref, children, ...props }: SelectProps) {
  return (
    <select
      ref={ref}
      className={controlClasses(props["aria-invalid"] === true, `h-10 pr-8 ${className}`)}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-rose-ink/30 text-rose-ink rounded-lg border bg-rose-50 px-3 py-2 text-sm"
    >
      {message}
    </div>
  );
}
