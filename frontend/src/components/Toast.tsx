import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { Icon } from "./Icon";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        <div role="status" aria-live="polite" className="contents">
          {toasts
            .filter((t) => t.tone !== "error")
            .map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts
            .filter((t) => t.tone === "error")
            .map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const tone =
    toast.tone === "error"
      ? "border-rose-200 bg-white text-rose-ink"
      : toast.tone === "info"
        ? "border-line bg-white text-ink-900"
        : "border-pine-200 bg-white text-pine-800";
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${tone}`}
    >
      <Icon
        name={toast.tone === "error" ? "alert" : toast.tone === "info" ? "info" : "check"}
        className="mt-0.5 size-4 shrink-0"
      />
      <p className="text-ink-900 flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-ink-500 hover:text-ink-900 rounded"
        aria-label="Dismiss notification"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
