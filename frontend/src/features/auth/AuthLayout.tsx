import type { ReactNode } from "react";
import { Link } from "react-router";

import { Logo } from "@/components/Logo";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative hidden min-h-dvh overflow-hidden lg:block lg:w-1/2">
        <img src="/auth-panel.jpg?v=2" alt="" className="absolute inset-0 size-full object-cover" />
        <div className="from-pine-900/75 via-pine-900/15 to-pine-900/35 absolute inset-0 bg-gradient-to-t" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link to="/" className="inline-flex">
            <Logo inverted />
          </Link>
          <div className="max-w-md">
            <p className="text-3xl leading-snug font-semibold">
              Every application deserves its own permanent record.
            </p>
            <p className="text-pine-100 mt-4">
              Keep the job description, the exact files you sent and everything that happened after
              — in one place you can trust months later.
            </p>
          </div>
          <p className="text-pine-100 text-sm">Your job search, organized.</p>
        </div>
      </aside>
      <main className="bg-paper flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-ink-900 text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-ink-500 mt-2 text-sm">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="text-ink-500 mt-8 text-sm">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
