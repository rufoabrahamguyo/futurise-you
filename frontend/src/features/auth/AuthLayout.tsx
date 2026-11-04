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
      <aside className="bg-pine-900 text-pine-50 relative hidden flex-col justify-between overflow-hidden p-10 lg:flex lg:w-[44%]">
        <Link to="/" className="relative z-10 inline-flex">
          <Logo inverted />
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="font-serif text-3xl leading-snug text-white">
            Every application deserves its own permanent record.
          </p>
          <p className="text-pine-100 mt-4">
            Keep the job description, the exact files you sent and everything that happened after —
            in one place you can trust months later.
          </p>
        </div>
        <p className="text-pine-200 relative z-10 text-sm">Your job search, organized.</p>
        <div
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 size-96 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -right-8 -bottom-8 size-64 rounded-full border border-white/10"
        />
      </aside>
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
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
