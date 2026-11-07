import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { AINoticeProvider } from "@/features/ai/AINotice";
import { useCurrentUser, useLogout } from "@/features/auth/hooks";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";
import { useMeta } from "@/lib/meta";

import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/applications", label: "My Applications", icon: "briefcase" },
  { to: "/documents", label: "Document Library", icon: "folder" },
  { to: "/reminders", label: "Calendar & Reminders", icon: "calendar" },
  { to: "/analytics", label: "Analytics", icon: "chart" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white/12 text-white"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <Icon name={item.icon} className="size-[18px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="bg-pine-900 flex h-full flex-col px-3 py-5">
      <div className="mb-8 px-3">
        <Logo inverted />
      </div>
      <SidebarNav onNavigate={onNavigate} />
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initials(user.full_name, user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user.full_name || "Your account"}
            </p>
            <p className="truncate text-xs text-white/75">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSettled: () => void navigate("/login") })}
          className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Icon name="logout" className="size-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function VerifyBanner() {
  const user = useCurrentUser();
  const toast = useToast();
  const resend = useMutation({
    mutationFn: () => api.post<undefined>("/auth/resend-verification"),
    onSuccess: () => toast.show("Verification email sent. Check your inbox."),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  if (user.is_email_verified) return null;
  return (
    <div className="text-pine-900 border-pine-200 bg-pine-50 border-b px-4 py-2 text-sm sm:px-8">
      <span className="font-medium">Confirm your email</span> so we can send reminder emails to{" "}
      {user.email}.{" "}
      <button
        type="button"
        className="font-semibold underline underline-offset-2"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
      >
        Resend link
      </button>
    </div>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  useMeta(); // load reference data (status labels) as early as possible

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="bg-surface sr-only z-50 rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="bg-ink-900/40 absolute inset-0"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}
      <header className="border-line bg-surface/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="!px-2 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" className="size-5" />
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
          </div>
        </div>
      </header>
      <VerifyBanner />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <AINoticeProvider>
          <Outlet />
        </AINoticeProvider>
      </main>
    </div>
  );
}
