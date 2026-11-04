import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/Button";
import { Notice } from "@/components/Feedback";
import { Field, FormError, Input } from "@/components/Field";
import { api } from "@/lib/api";
import { applyServerErrors } from "@/lib/forms";

import { AuthLayout } from "./AuthLayout";

const schema = z
  .object({
    new_password: z.string().min(10, "Use at least 10 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const confirm = useMutation({
    mutationFn: (v: Values) =>
      api.post<undefined>("/auth/password-reset/confirm", {
        uid: params.get("uid"),
        token: params.get("token"),
        new_password: v.new_password,
      }),
  });
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await confirm.mutateAsync(values);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ["new_password"]));
    }
  });

  return (
    <AuthLayout title="Choose a new password">
      {confirm.isSuccess ? (
        <div className="space-y-6">
          <Notice tone="success" title="Password updated">
            You can now sign in with your new password.
          </Notice>
          <ButtonLink to="/login" variant="primary" className="w-full">
            Sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormError message={formError} />
          <Field label="New password" error={formState.errors.new_password?.message}>
            {(a) => (
              <Input
                {...a}
                type="password"
                autoComplete="new-password"
                {...register("new_password")}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={formState.errors.confirm?.message}>
            {(a) => (
              <Input {...a} type="password" autoComplete="new-password" {...register("confirm")} />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={formState.isSubmitting}
          >
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
