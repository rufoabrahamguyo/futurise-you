import type { Application } from "@/lib/types";

export function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    company: { id: "c1", name: "Acme" },
    job_title: "Backend Engineer",
    location: "London",
    employment_type: "full_time",
    work_arrangement: "hybrid",
    status: "preparing",
    deadline: null,
    date_applied: null,
    submitted_at: null,
    completeness: {
      percent: 33,
      items: [
        { key: "job_description", label: "Job description saved", complete: true },
        { key: "submitted_documents", label: "Submitted documents preserved", complete: false },
        { key: "history", label: "Application history recorded", complete: false },
      ],
    },
    has_cv_attached: false,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-02T10:00:00Z",
    deleted_at: null,
    compensation: "",
    job_url: "",
    recruiter_name: "",
    recruiter_email: "",
    recruiter_phone: "",
    notes: "",
    status_changed_at: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}
