import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { Button } from "@/components/Button";
import { Notice } from "@/components/Feedback";
import { Field, FormError, Input } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";

import { AuthLayout } from "./AuthLayout";

const schema = z.object({ email: z.email("Enter a valid email address.") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const reset = useMutation({
    mutationFn: (v: Values) => api.post<undefined>("/auth/password-reset", v),
  });
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <Link to="/login" className="text-pine-700 font-medium underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {reset.isSuccess ? (
        <Notice tone="success" title="Check your inbox">
          If an account exists for that email, a reset link is on its way.
        </Notice>
      ) : (
        <form onSubmit={handleSubmit((v) => reset.mutate(v))} noValidate className="space-y-5">
          <FormError message={reset.isError ? errorMessage(reset.error) : null} />
          <Field label="Email" error={formState.errors.email?.message}>
            {(a) => <Input {...a} type="email" autoComplete="email" {...register("email")} />}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={reset.isPending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
