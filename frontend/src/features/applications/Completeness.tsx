import { Icon } from "@/components/Icon";
import type { Completeness } from "@/lib/types";

const HINTS: Record<string, string> = {
  job_description: "Save the job description",
  submitted_documents: "Attach files and mark as Applied",
  history: "Record an update on the timeline",
};

/** Compact meter: three segments, one per core record item. */
export function CompletenessMeter({ value }: { value: Completeness }) {
  const done = value.items.filter((i) => i.complete).length;
  return (
    <span
      className="inline-flex items-center gap-2"
      title={value.items.map((i) => `${i.complete ? "✓" : "○"} ${i.label}`).join("\n")}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {value.items.map((item) => (
          <span
            key={item.key}
            className={`h-1.5 w-3 rounded-full ${item.complete ? "bg-pine-600" : "bg-pine-100"}`}
          />
        ))}
      </span>
      <span className="text-ink-500 text-xs tabular-nums">
        {value.percent}%
        <span className="sr-only">
          {" "}
          record complete ({done} of {value.items.length})
        </span>
      </span>
    </span>
  );
}

/** Full checklist shown on the application page. */
export function CompletenessPanel({ value }: { value: Completeness }) {
  return (
    <section aria-labelledby="completeness-heading" className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2
          id="completeness-heading"
          className="text-ink-900 font-sans text-sm font-semibold tracking-normal"
        >
          Record completeness
        </h2>
        <span className="text-ink-900 text-sm font-semibold">{value.percent}%</span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {value.items.map((item) => (
          <span
            key={item.key}
            className={`h-1.5 flex-1 rounded-full ${item.complete ? "bg-pine-600" : "bg-pine-100"}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {value.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${item.complete ? "bg-pine-600 text-white" : "border-line-strong border text-transparent"}`}
            >
              <Icon name="check" className="size-3" />
            </span>
            <span>
              <span className={item.complete ? "text-ink-900" : "text-ink-700"}>{item.label}</span>
              {item.complete ? (
                <span className="sr-only"> (done)</span>
              ) : (
                <span className="text-ink-500 block text-xs">
                  Missing: {HINTS[item.key] ?? "Not yet recorded"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
