import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { makeApp, page } from "@/features/applications/fixtures";
import type { Reminder } from "@/lib/types";
import { fakeApi, renderRoutes, testUser } from "@/test/utils";

import { RemindersPage } from "./RemindersPage";
import { RemindersTab } from "./RemindersTab";

const reminder: Reminder = {
  id: "r1",
  application: { id: "a1", job_title: "Backend Engineer", company_name: "Acme", status: "applied" },
  type: "follow_up",
  title: "Follow up with Acme",
  notes: "",
  remind_at: "2030-01-15T09:00:00Z",
  channels: ["in_app", "email"],
  status: "pending",
  sent_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("reminders", () => {
  it("creates a reminder in the user's time zone and stores UTC", async () => {
    const api = fakeApi()
      .on("GET", "/reminders", page([]))
      .on("GET", "/applications", page([makeApp()]))
      .on("POST", "/reminders", { status: 201, body: reminder });
    renderRoutes([{ path: "/", element: <RemindersPage /> }], "/", {
      user: { ...testUser, timezone: "America/New_York" },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New reminder" }));
    const dialog = await screen.findByRole("dialog", { name: "New reminder" });
    await user.selectOptions(within(dialog).getByLabelText("Application"), "a1");
    await user.type(within(dialog).getByLabelText("Title"), "Chase recruiter");
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2026-07-15");
    await user.clear(within(dialog).getByLabelText("Time"));
    await user.type(within(dialog).getByLabelText("Time"), "09:00");
    await user.click(within(dialog).getByRole("button", { name: "Set reminder" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      application_id: "a1",
      type: "follow_up",
      title: "Chase recruiter",
      remind_at: "2026-07-15T13:00:00.000Z",
      channels: ["in_app", "email"],
    });
  });

  it("completing a follow-up prompts to record a timeline activity", async () => {
    const api = fakeApi()
      .on("GET", "/reminders", page([reminder]))
      .on("POST", "/reminders/r1/complete", {
        status: 200,
        body: { ...reminder, status: "completed" },
      })
      .on("POST", "/applications/a1/activities", { status: 201, body: {} });
    renderRoutes(
      [{ path: "/", element: <RemindersTab app={makeApp({ status: "applied" })} /> }],
      "/",
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Record the follow-up" });
    await user.type(within(dialog).getByLabelText(/What happened/), "Emailed Sam");
    await user.click(within(dialog).getByRole("button", { name: "Add to timeline" }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === "/applications/a1/activities")).toBe(true),
    );
    expect(api.calls.find((c) => c.path === "/applications/a1/activities")?.body).toMatchObject({
      type: "follow_up",
      body: "Emailed Sam",
    });
  });

  it("sets a quick follow-up for one week at 9:00", async () => {
    const api = fakeApi()
      .on("GET", "/reminders", page([]))
      .on("POST", "/reminders", { status: 201, body: reminder });
    renderRoutes([{ path: "/", element: <RemindersTab app={makeApp()} /> }], "/");
    await userEvent.setup().click(await screen.findByRole("button", { name: "In 1 week" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    const body = api.calls.find((c) => c.method === "POST")?.body as {
      remind_at: string;
      type: string;
    };
    expect(body.type).toBe("follow_up");
    expect(body.remind_at).toMatch(/T09:00:00.000Z$/);
  });
});
