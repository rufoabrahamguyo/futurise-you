import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderRoutes } from "@/test/utils";

import { makeApp } from "./fixtures";
import { NewApplicationPage } from "./NewApplicationPage";

const routes = [
  { path: "/applications/new", element: <NewApplicationPage /> },
  { path: "/applications/:id", element: <h1>Application page</h1> },
];

describe("add application", () => {
  it("creates an application and opens its record", async () => {
    const api = fakeApi().on("POST", "/applications", { status: 201, body: makeApp() });
    renderRoutes(routes, "/applications/new");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Job title"), "Backend Engineer");
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.selectOptions(screen.getByLabelText(/Work arrangement/), "hybrid");
    await user.type(screen.getByLabelText(/Job listing link/), "https://jobs.example.com/42");
    await user.type(screen.getByLabelText(/Application deadline/), "2026-04-30");
    await user.click(screen.getByRole("button", { name: "Save application" }));

    expect(await screen.findByRole("heading", { name: "Application page" })).toBeInTheDocument();
    const body = api.calls.find((c) => c.method === "POST" && c.path === "/applications")
      ?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      job_title: "Backend Engineer",
      company_name: "Acme",
      work_arrangement: "hybrid",
      job_url: "https://jobs.example.com/42",
      deadline: "2026-04-30",
      date_applied: null,
    });
  });

  it("requires a title and company, and checks the link format", async () => {
    const api = fakeApi();
    renderRoutes(routes, "/applications/new");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Job listing link/), "not a link");
    await user.click(screen.getByRole("button", { name: "Save application" }));
    expect(await screen.findByText("Enter the job title.")).toBeInTheDocument();
    expect(screen.getByText("Enter the company name.")).toBeInTheDocument();
    expect(screen.getByText(/Enter a full link/)).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("shows server validation errors inline", async () => {
    fakeApi().on("POST", "/applications", {
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Company not found.",
          details: { company_id: ["Company not found."] },
        },
      },
    });
    renderRoutes(routes, "/applications/new");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Job title"), "Engineer");
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.click(screen.getByRole("button", { name: "Save application" }));
    expect(await screen.findByText("Company not found.")).toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toHaveAttribute("aria-invalid", "true");
  });
});
