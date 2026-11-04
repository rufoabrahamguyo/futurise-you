import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/Button";
import { Field, FormError, Input, Select, Textarea } from "@/components/Field";
import { applyServerErrors } from "@/lib/forms";
import { useMeta } from "@/lib/meta";
import type { Application, ApplicationInput } from "@/lib/types";

const optionalUrl = z.union([z.literal(""), z.url("Enter a full link, starting with https://")]);
const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address.")]);

export const applicationSchema = z.object({
  company_name: z.string().trim().min(1, "Enter the company name.").max(200),
  job_title: z.string().trim().min(1, "Enter the job title.").max(255),
  location: z.string().trim().max(255),
  employment_type: z.string(),
  work_arrangement: z.string(),
  compensation: z.string().trim().max(200),
  job_url: optionalUrl,
  deadline: z.string(),
  date_applied: z.string(),
  recruiter_name: z.string().trim().max(200),
  recruiter_email: optionalEmail,
  recruiter_phone: z.string().trim().max(50),
  notes: z.string(),
});

export type ApplicationFormValues = z.infer<typeof applicationSchema>;

const FIELDS = Object.keys(applicationSchema.shape) as (keyof ApplicationFormValues)[];

export function toFormValues(app?: Partial<Application>): ApplicationFormValues {
  return {
    company_name: app?.company?.name ?? "",
    job_title: app?.job_title ?? "",
    location: app?.location ?? "",
    employment_type: app?.employment_type ?? "",
    work_arrangement: app?.work_arrangement ?? "",
    compensation: app?.compensation ?? "",
    job_url: app?.job_url ?? "",
    deadline: app?.deadline ?? "",
    date_applied: app?.date_applied ?? "",
    recruiter_name: app?.recruiter_name ?? "",
    recruiter_email: app?.recruiter_email ?? "",
    recruiter_phone: app?.recruiter_phone ?? "",
    notes: app?.notes ?? "",
  };
}

export function toInput(values: ApplicationFormValues, original?: Application): ApplicationInput {
  const input: ApplicationInput = {
    ...values,
    deadline: values.deadline || null,
    date_applied: values.date_applied || null,
  };
  // Only send the company when it changed, so editing keeps the same company record.
  if (original && original.company.name === values.company_name) delete input.company_name;
  return input;
}

interface Props {
  initial?: Application;
  defaults?: Partial<ApplicationFormValues>;
  submitLabel: string;
  onSubmit: (input: ApplicationInput) => Promise<unknown>;
  onCancel?: () => void;
  showNotes?: boolean;
}

export function ApplicationForm({
  initial,
  defaults,
  submitLabel,
  onSubmit,
  onCancel,
  showNotes = true,
}: Props) {
  const meta = useMeta();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { ...toFormValues(initial), ...defaults },
  });
  const errors = formState.errors;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(toInput(values, initial));
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS, { company_id: "company_name" }));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <FormError message={formError} />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-ink-900 mb-3 text-sm font-semibold sm:col-span-2">The role</legend>
        <Field label="Job title" error={errors.job_title?.message}>
          {(a) => <Input {...a} {...register("job_title")} autoComplete="off" />}
        </Field>
        <Field label="Company" error={errors.company_name?.message}>
          {(a) => <Input {...a} {...register("company_name")} autoComplete="organization" />}
        </Field>
        <Field label="Location" optional error={errors.location?.message}>
          {(a) => <Input {...a} {...register("location")} />}
        </Field>
        <Field
          label="Compensation"
          optional
          error={errors.compensation?.message}
          hint="As written in the listing, e.g. “£55–65k + bonus”."
        >
          {(a) => <Input {...a} {...register("compensation")} />}
        </Field>
        <Field label="Employment type" optional>
          {(a) => (
            <Select {...a} {...register("employment_type")}>
              <option value="">Not specified</option>
              {meta.data?.employment_types.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Work arrangement" optional>
          {(a) => (
            <Select {...a} {...register("work_arrangement")}>
              <option value="">Not specified</option>
              {meta.data?.work_arrangements.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Job listing link"
          optional
          error={errors.job_url?.message}
          hint="Saved as a link only. ApplyVault never fetches it."
          className="sm:col-span-2"
        >
          {(a) => (
            <Input
              {...a}
              type="url"
              inputMode="url"
              placeholder="https://"
              {...register("job_url")}
            />
          )}
        </Field>
        <Field label="Application deadline" optional error={errors.deadline?.message}>
          {(a) => <Input {...a} type="date" {...register("deadline")} />}
        </Field>
        <Field
          label="Date applied"
          optional
          error={errors.date_applied?.message}
          hint="Filled in automatically when you mark it Applied."
        >
          {(a) => <Input {...a} type="date" {...register("date_applied")} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="text-ink-900 mb-3 text-sm font-semibold sm:col-span-3">Recruiter</legend>
        <Field label="Name" optional error={errors.recruiter_name?.message}>
          {(a) => <Input {...a} {...register("recruiter_name")} autoComplete="off" />}
        </Field>
        <Field label="Email" optional error={errors.recruiter_email?.message}>
          {(a) => <Input {...a} type="email" {...register("recruiter_email")} autoComplete="off" />}
        </Field>
        <Field label="Phone" optional error={errors.recruiter_phone?.message}>
          {(a) => <Input {...a} type="tel" {...register("recruiter_phone")} autoComplete="off" />}
        </Field>
      </fieldset>

      {showNotes ? (
        <Field label="Notes" optional>
          {(a) => <Textarea {...a} rows={3} {...register("notes")} />}
        </Field>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button onClick={onCancel} disabled={formState.isSubmitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
