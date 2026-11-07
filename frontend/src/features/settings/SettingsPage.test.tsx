import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderRoutes } from "@/test/utils";

import { SettingsPage } from "./SettingsPage";

const routes = [
  { path: "/settings", element: <SettingsPage /> },
  { path: "/login", element: <h1>Sign in page</h1> },
];

describe("settings", () => {
  it("deletes the account only after typed confirmation and password", async () => {
    const api = fakeApi()
      .on("GET", "/exports", [])
      .on("GET", "/ai/usage", { used_today: 0, daily_limit: 25 })
      .on("POST", "/auth/delete-account", { status: 202, body: {} });
    renderRoutes(routes, "/settings");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account permanently?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete everything" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Your password"), "my-password");
    await user.click(confirm);
    expect(await screen.findByRole("heading", { name: "Sign in page" })).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === "/auth/delete-account")?.body).toEqual({
      password: "my-password",
    });
  });

  it("requests an export and offers the download when ready", async () => {
    const ready = {
      id: "e1",
      status: "succeeded",
      size: 2048,
      created_at: "2026-03-01T10:00:00Z",
      completed_at: "2026-03-01T10:01:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      downloadable: true,
    };
    const api = fakeApi()
      .on("GET", "/ai/usage", { used_today: 3, daily_limit: 25 })
      .on("GET", "/exports", [ready])
      .on("POST", "/exports", {
        status: 202,
        body: { ...ready, status: "queued", downloadable: false },
      });
    renderRoutes(routes, "/settings");
    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByText(/AI requests today/)).toHaveTextContent("3 of 25");
    await userEvent.setup().click(screen.getByRole("button", { name: "Request export" }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === "POST" && c.path === "/exports")).toBe(true),
    );
  });

  it("saves the time zone", async () => {
    const api = fakeApi()
      .on("GET", "/exports", [])
      .on("GET", "/ai/usage", { used_today: 0, daily_limit: 25 })
      .on("PATCH", "/auth/me", (body: unknown) => ({ status: 200, body }));
    renderRoutes(routes, "/settings");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Time zone"), "Europe/London");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
        timezone: "Europe/London",
      }),
    );
  });
});
