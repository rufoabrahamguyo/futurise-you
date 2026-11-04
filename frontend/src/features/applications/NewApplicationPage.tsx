import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/Button";
import { Field, FormError, Input } from "@/components/Field";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { JobDescriptionInput } from "@/features/jobdescriptions/JobDescriptionInput";
import { ApiError, api, errorMessage } from "@/lib/api";

import { ApplicationForm } from "./ApplicationForm";
import { useCreateApplication } from "./api";

type Start = "choose" | "manual" | "paste" | "upload";

const STARTS: { id: Exclude<Start, "choose">; title: string; body: string; icon: IconName }[] = [
  {
    id: "paste",
    title: "Paste the job description",
    body: "Keep the listing text. AI can then fill in the details for you to review.",
    icon: "note",
  },
  {
    id: "upload",
    title: "Upload the job description",
    body: "Save the original PDF or DOCX exactly as it was.",
    icon: "upload",
  },
  {
    id: "manual",
    title: "Enter details manually",
    body: "Type in the role, company and dates yourself.",
    icon: "pencil",
  },
];

export function NewApplicationPage() {
  const [start, setStart] = useState<Start>("choose");
  const create = useCreateApplication();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Add application"
        description="Start a permanent record for a job you're applying to."
      />
      {start === "choose" ? (
        <ul className="grid max-w-4xl gap-4 md:grid-cols-3">
          {STARTS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => setStart(option.id)}
                className="card hover:border-pine-200 flex h-full w-full flex-col p-5 text-left transition-colors"
              >
                <span className="bg-pine-50 text-pine-700 mb-4 flex size-10 items-center justify-center rounded-lg">
                  <Icon name={option.icon} className="size-5" />
                </span>
                <span className="text-ink-900 font-semibold">{option.title}</span>
                <span className="text-ink-500 mt-1 text-sm">{option.body}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : start === "manual" ? (
        <div className="card max-w-3xl p-5 sm:p-6">
          <ApplicationForm
            submitLabel="Save application"
            onCancel={() => setStart("choose")}
            onSubmit={async (input) => {
              const app = await create.mutateAsync(input);
              toast.show(`Saved “${app.job_title}”.`);
              void navigate(`/applications/${app.id}`);
            }}
          />
        </div>
      ) : (
        <StartFromJobDescription
          key={start}
          initialMode={start}
          onBack={() => setStart("choose")}
        />
      )}
    </>
  );
}

function StartFromJobDescription({
  initialMode,
  onBack,
}: {
  initialMode: "paste" | "upload";
  onBack: () => void;
}) {
  const create = useCreateApplication();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState(initialMode);
  const [value, setValue] = useState<{ text: string; file: File | null }>({ text: "", file: null });
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const next: Record<string, string> = {};
    if (!jobTitle.trim()) next.job_title = "Enter the job title.";
    if (!company.trim()) next.company_name = "Enter the company name.";
    if (mode === "paste" && value.text.trim().length < 20)
      next.jd = "Paste the full job description (at least a few lines).";
    if (mode === "upload" && !value.file) next.jd = "Choose a PDF or DOCX file.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setSaving(true);
    let appId: string;
    try {
      appId = (
        await create.mutateAsync({ job_title: jobTitle.trim(), company_name: company.trim() })
      ).id;
    } catch (error) {
      setSaving(false);
      const fields = error instanceof ApiError ? error.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(error));
      return;
    }
    // The application is saved first, so a failed upload never loses what was entered.
    try {
      if (mode === "upload" && value.file) {
        const form = new FormData();
        form.set("file", value.file);
        await api.post(`/applications/${appId}/job-description/upload`, form);
      } else {
        await api.post(`/applications/${appId}/job-description/paste`, { text: value.text });
      }
      toast.show("Application and job description saved.");
    } catch (error) {
      toast.show(
        `Application saved, but the job description wasn't: ${errorMessage(error)} You can add it from the Job Description tab.`,
        "error",
      );
    }
    setSaving(false);
    void navigate(`/applications/${appId}?tab=job-description`);
  }

  return (
    <div className="card max-w-3xl space-y-5 p-5 sm:p-6">
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" error={errors.job_title}>
          {(a) => <Input {...a} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />}
        </Field>
        <Field label="Company" error={errors.company_name}>
          {(a) => <Input {...a} value={company} onChange={(e) => setCompany(e.target.value)} />}
        </Field>
      </div>
      <JobDescriptionInput
        mode={mode}
        onModeChange={setMode}
        value={value}
        onChange={setValue}
        error={errors.jd}
      />
      <p className="text-ink-500 text-xs">
        The original job description is kept permanently. After saving you can run AI extraction and
        review the results before anything changes.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          Save application
        </Button>
      </div>
    </div>
  );
}
