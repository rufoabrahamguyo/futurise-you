import type { ReactNode } from "react";

import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <div className={`bg-ink-900/[0.07] animate-pulse rounded-md ${className}`} aria-hidden="true" />
  );
}

export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, children, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-14"} px-6`}>
      <div className="bg-pine-50 text-pine-700 mb-4 flex size-12 items-center justify-center rounded-full">
        <Icon name={icon} className="size-6" />
      </div>
      <h3 className="text-ink-900 text-base font-semibold">{title}</h3>
      {children ? <div className="text-ink-500 mt-1.5 max-w-sm text-sm">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="text-rose-ink mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50">
        <Icon name="alert" className="size-6" />
      </div>
      <h3 className="text-ink-900 text-base font-semibold">We couldn&apos;t load this</h3>
      <p className="text-ink-500 mt-1.5 max-w-sm text-sm">{message}</p>
      {onRetry ? (
        <Button className="mt-5" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

type Tone = "info" | "warning" | "danger" | "success";

const TONES: Record<Tone, { box: string; icon: IconName }> = {
  info: { box: "border-pine-200 bg-pine-50 text-pine-900", icon: "info" },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-ink", icon: "alert" },
  danger: { box: "border-rose-200 bg-rose-50 text-rose-ink", icon: "alert" },
  success: { box: "border-pine-200 bg-pine-50 text-pine-800", icon: "check" },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const style = TONES[tone];
  return (
    <div
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${style.box}`}
      role={tone === "danger" ? "alert" : "note"}
    >
      <Icon name={style.icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
