import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { api } from "@/lib/api";
import { statusStyle } from "@/lib/statusStyles";
import type { ApplicationSummary, Page } from "@/lib/types";
import { useDebounced } from "@/lib/useDebounced";

/** Search applications by company or job title. Press "/" to focus. */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const listId = useId();
  const term = useDebounced(query.trim(), 250);

  const results = useQuery({
    queryKey: ["search", term],
    queryFn: ({ signal }) =>
      api.get<Page<ApplicationSummary>>("/applications", { q: term, page_size: 8 }, signal),
    enabled: term.length > 0,
  });
  const items = term ? (results.data?.results ?? []) : [];

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(item: ApplicationSummary) {
    setOpen(false);
    setQuery("");
    void navigate(`/applications/${item.id}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const item = items[active];
      if (item) {
        event.preventDefault();
        go(item);
      } else if (term) {
        setOpen(false);
        void navigate(`/applications?view=table&q=${encodeURIComponent(term)}`);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && term.length > 0;

  return (
    <div className="relative w-full max-w-md">
      <Icon
        name="search"
        className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search applications by company or job title"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && items[active] ? `${listId}-${items[active].id}` : undefined
        }
        placeholder="Search company or job title"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="border-line bg-paper placeholder:text-ink-400 focus:bg-surface focus-visible:outline-pine-600 h-10 w-full rounded-lg border pr-10 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
      />
      <kbd className="border-line text-ink-400 pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 text-xs sm:block">
        /
      </kbd>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="border-line bg-surface absolute top-full right-0 left-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border p-1 shadow-lg"
        >
          {results.isFetching && items.length === 0 ? (
            <li className="text-ink-500 flex items-center gap-2 px-3 py-3 text-sm">
              <Spinner className="size-4" /> Searching…
            </li>
          ) : items.length === 0 ? (
            <li className="text-ink-500 px-3 py-3 text-sm">No applications match “{term}”.</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${index === active ? "bg-pine-50" : ""}`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${statusStyle(item.status).dot}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-900 block truncate text-sm font-medium">
                    {item.job_title}
                  </span>
                  <span className="text-ink-500 block truncate text-xs">{item.company.name}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
