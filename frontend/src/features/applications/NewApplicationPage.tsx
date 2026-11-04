import { useNavigate } from "react-router";

import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

import { ApplicationForm } from "./ApplicationForm";
import { useCreateApplication } from "./api";

export function NewApplicationPage() {
  const create = useCreateApplication();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Add application"
        description="Start a record for a job you're applying to."
      />
      <div className="card max-w-3xl p-5 sm:p-6">
        <ApplicationForm
          submitLabel="Save application"
          onCancel={() => void navigate(-1)}
          onSubmit={async (input) => {
            const app = await create.mutateAsync(input);
            toast.show(`Saved “${app.job_title}”.`);
            void navigate(`/applications/${app.id}`);
          }}
        />
      </div>
    </>
  );
}
