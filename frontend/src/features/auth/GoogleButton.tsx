import { buttonClasses } from "@/components/Button";

import { browserTimeZone } from "./hooks";

export const GOOGLE_ERRORS: Record<string, string> = {
  google_unconfigured: "Google sign-in is not set up yet. Use your email and password.",
  google_denied: "Google sign-in was cancelled.",
  google_email: "Google did not share a verified email address.",
  google_failed: "Google sign-in didn't work. Try again.",
  google_inactive: "This account can't be used to sign in.",
};

export function googleErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return GOOGLE_ERRORS[code] ?? null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/** Full-page navigation into the Google OAuth redirect. */
export function ContinueWithGoogle() {
  const href = `/api/v1/auth/google?${new URLSearchParams({ timezone: browserTimeZone() })}`;
  return (
    <div className="mb-6">
      <a href={href} className={buttonClasses("secondary", "md", "w-full")}>
        <GoogleMark />
        Continue with Google
      </a>
      <div className="text-ink-400 mt-6 flex items-center gap-3 text-xs font-medium tracking-wide uppercase">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
    </div>
  );
}
