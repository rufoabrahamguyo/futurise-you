import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix: string;
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the ends. */
export function Tabs({ tabs, active, onChange, label, idPrefix }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) {
      onChange(tab.id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="border-line -mb-px flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              selected
                ? "border-pine-700 text-pine-800"
                : "text-ink-500 hover:text-ink-900 border-transparent"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix,
  children,
}: {
  id: string;
  idPrefix: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className="pt-6 focus-visible:outline-none"
    >
      {children}
    </div>
  );
}
