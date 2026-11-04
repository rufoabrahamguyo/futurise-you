import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { AppNotification, Page } from "@/lib/types";

const KEY = ["notifications"] as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  const unread = useQuery({
    queryKey: [...KEY, "unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: [...KEY, "list"],
    queryFn: () => api.get<Page<AppNotification>>("/notifications", { page_size: 10 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<AppNotification>(`/notifications/${id}/read`),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post<undefined>("/notifications/read-all"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = unread.data?.count ?? 0;

  function openNotification(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) void navigate(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        className="text-ink-700 hover:bg-ink-900/5 relative flex size-10 items-center justify-center rounded-lg"
      >
        <Icon name="bell" className="size-5" />
        {count > 0 ? (
          <span
            className="bg-rose-ink absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white"
            aria-hidden="true"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="border-line bg-surface absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border shadow-lg"
        >
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-sans text-sm font-semibold tracking-normal">Notifications</h2>
            {count > 0 ? (
              <button
                type="button"
                className="text-pine-700 text-xs font-medium hover:underline"
                onClick={() => markAll.mutate()}
              >
                Mark all as read
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {list.isPending ? (
              <li className="text-ink-500 px-4 py-6 text-center text-sm">Loading…</li>
            ) : list.isError ? (
              <li className="text-rose-ink px-4 py-6 text-center text-sm">
                Couldn&apos;t load notifications.
              </li>
            ) : list.data.results.length === 0 ? (
              <li className="text-ink-500 px-4 py-8 text-center text-sm">
                You&apos;re all caught up.
              </li>
            ) : (
              list.data.results.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className="hover:bg-paper flex w-full gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-pine-600"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${n.read_at ? "text-ink-700" : "text-ink-900 font-semibold"}`}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="text-ink-500 mt-0.5 block text-xs">{n.body}</span>
                      ) : null}
                      <span className="text-ink-400 mt-1 block text-xs">
                        {formatRelative(n.created_at)}
                        {n.read_at ? null : <span className="sr-only">, unread</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
