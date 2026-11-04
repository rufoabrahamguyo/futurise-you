import { Navigate, Outlet, useLocation } from "react-router";

import { ErrorState } from "@/components/Feedback";
import { Spinner } from "@/components/Spinner";
import { useMe } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api";

function FullPageSpinner() {
  return (
    <div className="text-pine-700 flex min-h-dvh items-center justify-center">
      <Spinner className="size-6" label="Loading ApplyVault" />
    </div>
  );
}

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPageSpinner />;
  if (me.isError)
    return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  if (!me.data)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const me = useMe();
  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
