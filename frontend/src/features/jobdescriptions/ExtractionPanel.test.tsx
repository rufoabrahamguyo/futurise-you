import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AINoticeProvider } from "@/features/ai/AINotice";
import { makeApp } from "@/features/applications/fixtures";
import type { Extraction, JobDescription } from "@/lib/types";
import { fakeApi, renderRoutes, testUser } from "@/test/utils";

import { ExtractionPanel } from "./ExtractionPanel";

const SOURCE =
  "Data Engineer\nHarbor & Co\nLocation: Bristol, UK\nApplications close on 30 June 2026.";

const output: Extraction = {
  job_title: { value: "Data Engineer", quote: "Data Engineer" },
  company: { value: "Harbor & Co", quote: "Harbor & Co" },
  location: { value: "Bristol, UK", quote: "Location: Bristol, UK" },
  employment_type: null,
  work_arrangement: null,
  compensation: null,
  deadline: {
    value: "30 June 2026",
    quote: "Applications close on 30 June 2026.",
    parsed_date: "2026-06-30",
  },
  required_skills: [{ value: "Python", quote: "Python" }],
  education: [],
  experience: [],
  responsibilities: [],
  mandatory_requirements: [],
  preferred_qualifications: [],
  eligibility_criteria: [],
  benefits: [],
  required_documents: [],
  application_instructions: [],
};

function jd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    id: "jd1",
    source_type: "paste",
    original_text: SOURCE,
    text_source: "paste",
    has_text: true,
    has_file: false,
    original_filename: "",
    original_file_mime: "",
    original_file_size: null,
    original_file_sha256: "",
    extraction_status: "succeeded",
    extraction_error: "",
    extracted_at: "2026-03-01T10:00:00Z",
    raw_ai_output: {
      model: "fake",
      prompt_version: "extract-v1",
      output,
      discarded: [{ field: "compensation", value: "£90k", reason: "quote_not_found" }],
    },
    reviewed_data: null,
    reviewed_at: null,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

function renderPanel(data: JobDescription, user = testUser) {
  return renderRoutes(
    [
      {
        path: "/",
        element: (
          <AINoticeProvider>
            <ExtractionPanel app={makeApp({ job_title: "Untitled" })} jd={data} />
          </AINoticeProvider>
        ),
      },
    ],
    "/",
    { user },
  );
}

describe("extraction", () => {
  it("shows the AI notice before the first AI action, then queues extraction", async () => {
    const api = fakeApi()
      .on("POST", "/auth/ai-acknowledgement", {
        ...testUser,
        ai_acknowledged_at: "2026-03-01T10:00:00Z",
      })
      .on("POST", "/applications/a1/job-description/extract", {
        status: 202,
        body: jd({ extraction_status: "queued", raw_ai_output: null }),
      });
    renderPanel(jd({ extraction_status: "not_started", raw_ai_output: null }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Extract details with AI" }));
    const notice = await screen.findByRole("dialog", { name: "Before you use AI" });
    expect(
      within(notice).getByText(/email addresses and phone numbers removed/),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.endsWith("/extract"))).toBe(false);
    await user.click(within(notice).getByRole("button", { name: "I understand, continue" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/extract"))).toBe(true));
    expect(api.calls.map((c) => c.path)).toContain("/auth/ai-acknowledgement");
  });

  it("shows a retry button and reassurance when extraction failed", () => {
    renderPanel(
      jd({
        extraction_status: "failed",
        extraction_error: "provider_unavailable",
        raw_ai_output: null,
      }),
      { ...testUser, ai_acknowledged_at: "2026-01-01T00:00:00Z" },
    );
    expect(screen.getByText("Extraction didn't finish")).toBeInTheDocument();
    expect(screen.getByText(/Your job description and details are safe/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("reviews side by side, shows unsupported values as Not specified, and approves", async () => {
    const api = fakeApi().on(
      "PUT",
      "/applications/a1/job-description/review",
      jd({ reviewed_data: null }),
    );
    renderPanel(jd());
    const user = userEvent.setup();
    expect(
      screen.getByText("AI-extracted. Review and correct anything before relying on it."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review extracted details" }));
    const dialog = await screen.findByRole("dialog", { name: "Review extracted details" });

    expect(within(dialog).getByLabelText("Original job description")).toHaveTextContent(
      "Applications close on 30 June 2026.",
    );
    expect(within(dialog).getByLabelText("Job title")).toHaveValue("Data Engineer");
    const compensation = within(dialog).getByLabelText("Compensation");
    expect(compensation).toHaveValue("");
    expect(compensation).toHaveAttribute("placeholder", "Not specified");
    expect(within(dialog).getByText(/1 suggestion was removed/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-06-30");

    await user.clear(within(dialog).getByLabelText("Location"));
    await user.type(within(dialog).getByLabelText("Location"), "Bristol (hybrid)");
    await user.selectOptions(within(dialog).getByLabelText("Work arrangement"), "hybrid");
    await user.type(within(dialog).getByLabelText("Benefits"), "Pension{enter}{enter}Gym");
    await user.click(
      within(dialog).getByRole("button", { name: "Approve and update application" }),
    );

    await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
    const body = api.calls.find((c) => c.method === "PUT")?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      job_title: "Data Engineer",
      location: "Bristol (hybrid)",
      work_arrangement: "hybrid",
      compensation: null,
      deadline: "2026-06-30",
      deadline_text: "30 June 2026",
      benefits: ["Pension", "Gym"],
      required_skills: ["Python"],
      education: [],
    });
  });

  it("shows the reviewed version with Not specified for empty fields", () => {
    renderPanel(
      jd({
        reviewed_at: "2026-03-02T10:00:00Z",
        reviewed_data: {
          job_title: "Data Engineer",
          company: "Harbor & Co",
          location: null,
          employment_type: null,
          work_arrangement: null,
          compensation: null,
          deadline_text: null,
          deadline: null,
          required_skills: ["Python"],
          education: [],
          experience: [],
          responsibilities: [],
          mandatory_requirements: [],
          preferred_qualifications: [],
          eligibility_criteria: [],
          benefits: [],
          required_documents: [],
          application_instructions: [],
        },
      }),
    );
    expect(screen.getByRole("heading", { name: "Your reviewed version" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Benefits" })).getByText("Not specified"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(5);
    expect(
      screen.getByRole("button", { name: /Compare with the original AI suggestion/ }),
    ).toBeInTheDocument();
  });
});
