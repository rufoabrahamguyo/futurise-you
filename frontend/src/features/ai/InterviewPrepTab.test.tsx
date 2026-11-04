import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { makeApp } from "@/features/applications/fixtures";
import type { InterviewPreparation } from "@/lib/types";
import { fakeApi, renderRoutes, testUser } from "@/test/utils";

import { AINoticeProvider } from "./AINotice";
import { InterviewPrepTab, PREP_DISCLAIMER } from "./InterviewPrepTab";

const prep: InterviewPreparation = {
  id: "p1",
  status: "succeeded",
  content: {
    technical_questions: [
      {
        question: "How have you used Kubernetes?",
        why_asked: "Listed in the job description.",
        answer_outline: ["Context", "Outcome"],
      },
    ],
    behavioral_questions: [
      {
        question: "Tell me about a tight deadline.",
        why_asked: "Prioritisation.",
        star_hint: "Use STAR.",
      },
    ],
    cv_questions: [
      {
        question: "Tell me about the migration on your CV.",
        cv_evidence: "Led Kubernetes migration.",
      },
    ],
    role_questions: [
      { question: "How would you run the platform?", why_asked: "Core responsibility." },
    ],
    preparation_topics: ["Prepare a Kubernetes story"],
  },
  input_references: {},
  missing_inputs: ["submitted_cover_letter"],
  user_notes: "",
  error: "",
  model_name: "fake",
  prompt_version: "prep-v1",
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-01T10:00:00Z",
};

function render(status: string) {
  return renderRoutes(
    [
      {
        path: "/",
        element: (
          <AINoticeProvider>
            <InterviewPrepTab app={makeApp({ status })} />
          </AINoticeProvider>
        ),
      },
    ],
    "/",
    { user: { ...testUser, ai_acknowledged_at: "2026-01-01T00:00:00Z" } },
  );
}

describe("interview prep", () => {
  it("is not offered before Interview", () => {
    fakeApi();
    render("applied");
    expect(screen.getByText("Available when you reach Interview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepare with AI" })).not.toBeInTheDocument();
  });

  it("renders every section with the disclaimer and what was missing, and saves notes", async () => {
    const api = fakeApi()
      .on("GET", "/applications/a1/interview-prep", [prep])
      .on("PATCH", "/interview-preps/p1", { ...prep, user_notes: "Practise the migration story" });
    render("interview");
    expect(await screen.findByText(PREP_DISCLAIMER)).toBeInTheDocument();
    expect(PREP_DISCLAIMER).toBe(
      "AI-generated practice questions. These are not actual questions from the employer.",
    );
    for (const name of [
      "Technical questions",
      "Behavioural questions",
      "Questions about your CV",
      "Role-specific questions",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("How have you used Kubernetes?")).toBeInTheDocument();
    expect(screen.getByText("Prepare a Kubernetes story")).toBeInTheDocument();
    expect(screen.getByText(/made without a submitted cover letter/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "My notes" }),
      "Practise the migration story",
    );
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({
        user_notes: "Practise the migration story",
      }),
    );
  });

  it("generates a new set from Interview onwards", async () => {
    const api = fakeApi()
      .on("GET", "/applications/a1/interview-prep", [])
      .on("POST", "/applications/a1/interview-prep", {
        status: 202,
        body: { ...prep, status: "queued", content: null },
      });
    render("offer");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Prepare with AI" }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === "POST" && c.path === "/applications/a1/interview-prep"),
      ).toBe(true),
    );
  });
});
