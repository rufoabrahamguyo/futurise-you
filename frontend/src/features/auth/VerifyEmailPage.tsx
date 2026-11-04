import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

import { ButtonLink } from "@/components/Button";
import { Notice } from "@/components/Feedback";
import { Spinner } from "@/components/Spinner";
import { api, errorMessage } from "@/lib/api";

import { AuthLayout } from "./AuthLayout";
import { meKey, useMe } from "./hooks";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const me = useMe();
  const verify = useMutation({
    mutationFn: () =>
      api.post<undefined>("/auth/verify-email", {
        uid: params.get("uid"),
        token: params.get("token"),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verify.mutate();
  }, [verify]);

  const next = me.data ? "/dashboard" : "/login";

  return (
    <AuthLayout title="Confirm your email">
      {verify.isPending || verify.isIdle ? (
        <p className="text-ink-500 flex items-center gap-2 text-sm">
          <Spinner className="size-4" /> Confirming…
        </p>
      ) : verify.isSuccess ? (
        <div className="space-y-6">
          <Notice tone="success" title="Email confirmed">
            We can now send you reminder emails.
          </Notice>
          <ButtonLink to={next} variant="primary" className="w-full">
            Continue
          </ButtonLink>
        </div>
      ) : (
        <div className="space-y-6">
          <Notice tone="danger" title="This link didn't work">
            {errorMessage(verify.error)} You can request a new link from the banner after signing
            in.
          </Notice>
          <ButtonLink to={next} className="w-full">
            Continue
          </ButtonLink>
        </div>
      )}
    </AuthLayout>
  );
}
