import { isRouteErrorResponse, useRouteError } from "react-router";

import { ButtonLink } from "@/components/Button";
import { EmptyState } from "@/components/Feedback";

export function NotFoundPage() {
  return (
    <EmptyState
      icon="search"
      title="Page not found"
      action={<ButtonLink to="/dashboard">Go to dashboard</ButtonLink>}
    >
      The page you were looking for doesn&apos;t exist or has moved.
    </EmptyState>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={notFound ? "search" : "alert"}
        title={notFound ? "Page not found" : "Something went wrong"}
        action={<ButtonLink to="/dashboard">Go to dashboard</ButtonLink>}
      >
        {notFound
          ? "The page you were looking for doesn't exist."
          : "An unexpected error occurred. Your data is safe — try reloading the page."}
      </EmptyState>
    </div>
  );
}
