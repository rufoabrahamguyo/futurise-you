import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";

import { Button } from "@/components/Button";
import { Field, FormError, Input } from "@/components/Field";
import { applyServerErrors } from "@/lib/forms";

import { AuthLayout } from "./AuthLayout";
import { ContinueWithGoogle, googleErrorMessage } from "./GoogleButton";
import { useLogin } from "./hooks";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const googleError = googleErrorMessage(params.get("error"));
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      void navigate(from, { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ["email", "password"]));
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your vault."
      footer={
        <>
          New to KaziTrail?{" "}
          <Link
            to="/register"
            className="text-pine-700 font-medium underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <ContinueWithGoogle />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError ?? googleError} />
        <Field label="Email" error={formState.errors.email?.message}>
          {(a) => <Input {...a} type="email" autoComplete="email" {...register("email")} />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(a) => (
            <Input
              {...a}
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-pine-700 text-sm font-medium underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
