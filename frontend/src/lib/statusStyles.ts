/**
 * Visual treatment per status. Statuses themselves come from the API (/meta);
 * unknown future statuses fall back to the neutral style.
 */

interface StatusStyle {
  dot: string;
  badge: string;
  column: string;
}

const STYLES: Record<string, StatusStyle> = {
  saved: {
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-800",
    column: "border-t-slate-400",
  },
  preparing: { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-900", column: "border-t-sky-500" },
  applied: { dot: "bg-pine-600", badge: "bg-pine-100 text-pine-800", column: "border-t-pine-600" },
  assessment: {
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-900",
    column: "border-t-violet-500",
  },
  interview: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-ink",
    column: "border-t-amber-500",
  },
  offer: {
    dot: "bg-emerald-600",
    badge: "bg-emerald-100 text-emerald-900",
    column: "border-t-emerald-600",
  },
  rejected: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-ink", column: "border-t-rose-500" },
  withdrawn: {
    dot: "bg-stone-400",
    badge: "bg-stone-200 text-stone-800",
    column: "border-t-stone-400",
  },
};

const FALLBACK: StatusStyle = {
  dot: "bg-ink-400",
  badge: "bg-ink-900/[0.06] text-ink-700",
  column: "border-t-ink-400",
};

export function statusStyle(status: string): StatusStyle {
  return STYLES[status] ?? FALLBACK;
}
