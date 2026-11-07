import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";

import { Button } from "@/components/Button";
import { Field, FormError, Input } from "@/components/Field";
import { applyServerErrors } from "@/lib/forms";

import { AuthLayout } from "./AuthLayout";
import { ContinueWithGoogle, googleErrorMessage } from "./GoogleButton";
import { browserTimeZone, useRegister } from "./hooks";

const schema = z.object({
  full_name: z.string().trim().max(200),
  email: z.email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters."),
});
type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const registerUser = useRegister();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const googleError = googleErrorMessage(params.get("error"));
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync({ ...values, timezone: browserTimeZone() });
      void navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ["full_name", "email", "password"], {
          non_field_errors: "password",
        }),
      );
    }
  });

  return (
    <AuthLayout
      title="Create your vault"
      subtitle="Free, private, and yours. We'll never share your applications."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-pine-700 font-medium underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <ContinueWithGoogle />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError ?? googleError} />
        <Field label="Full name" optional error={formState.errors.full_name?.message}>
          {(a) => <Input {...a} autoComplete="name" {...register("full_name")} />}
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          {(a) => <Input {...a} type="email" autoComplete="email" {...register("email")} />}
        </Field>
        <Field
          label="Password"
          error={formState.errors.password?.message}
          hint="At least 10 characters. Avoid common passwords."
        >
          {(a) => (
            <Input {...a} type="password" autoComplete="new-password" {...register("password")} />
          )}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
