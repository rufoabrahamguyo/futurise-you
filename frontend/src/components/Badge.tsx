import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Tone = "neutral" | "pine" | "amber" | "rose" | "sky" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-900/[0.06] text-ink-700",
  pine: "bg-pine-100 text-pine-800",
  amber: "bg-amber-100 text-amber-ink",
  rose: "bg-rose-100 text-rose-ink",
  sky: "bg-sky-100 text-sky-900",
  violet: "bg-violet-100 text-violet-900",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {icon ? <Icon name={icon} className="size-3" /> : null}
      {children}
    </span>
  );
}
