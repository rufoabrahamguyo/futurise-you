import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderRoutes } from "@/test/utils";

import { ApplicationsPage } from "./ApplicationsPage";
import { makeApp, page } from "./fixtures";

const routes = [
  { path: "/applications", element: <ApplicationsPage /> },
  { path: "/applications/:id", element: <h1>Detail</h1> },
];

describe("my applications", () => {
  it("shows a Kanban column per status with the application in its column", async () => {
    fakeApi().on("GET", "/applications", page([makeApp({ status: "interview" })]));
    renderRoutes(routes, "/applications");
    const column = await screen.findByRole("region", { name: /Interview, 1 applications/ });
    expect(within(column).getByRole("link", { name: "Backend Engineer" })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(8);
  });

  it("changes status from the keyboard and confirms before freezing at Applied", async () => {
    const api = fakeApi()
      .on("GET", "/applications", page([makeApp()]))
      .on("POST", "/applications/a1/status", {
        application: makeApp({ status: "applied" }),
        warnings: ["no_cv"],
      });
    renderRoutes(routes, "/applications");
    const user = userEvent.setup();

    const select = await screen.findByLabelText("Move for Backend Engineer");
    await user.selectOptions(select, "applied");

    const dialog = await screen.findByRole("dialog", { name: "Mark as applied?" });
    expect(within(dialog).getByText("No CV attached")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Continue without a CV" }));

    await waitFor(() =>
      expect(api.calls.some((c) => c.path === "/applications/a1/status")).toBe(true),
    );
    expect(api.calls.find((c) => c.path === "/applications/a1/status")?.body).toEqual({
      status: "applied",
      note: "",
    });
    expect(await screen.findByText(/No CV was attached/)).toBeInTheDocument();
  });

  it("does not ask for confirmation for other moves, and rolls back on failure", async () => {
    fakeApi()
      .on(
        "GET",
        "/applications",
        page([makeApp({ status: "applied", submitted_at: "2026-03-03T10:00:00Z" })]),
      )
      .on("POST", "/applications/a1/status", {
        status: 500,
        body: { error: { code: "error", message: "Server unavailable.", details: {} } },
      });
    renderRoutes(routes, "/applications");
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText("Move for Backend Engineer"),
      "interview",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/Status not changed: Server unavailable/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /Applied, 1 applications/ })).toBeInTheDocument(),
    );
  });

  it("keeps the chosen view and search in the URL", async () => {
    const api = fakeApi().on("GET", "/applications", page([makeApp()]));
    const { router } = renderRoutes(routes, "/applications");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Table" }));
    expect(router.state.location.search).toContain("view=table");
    expect(await screen.findByRole("table")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search applications"), "acme");
    await waitFor(() => expect(router.state.location.search).toContain("q=acme"));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === "/applications" && c.body === undefined)).toBe(true),
    );
  });

  it("sorts the table by a column", async () => {
    const api = fakeApi().on("GET", "/applications", page([makeApp()]));
    const { router } = renderRoutes(routes, "/applications?view=table");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Deadline/ }));
    expect(router.state.location.search).toContain("ordering=deadline");
    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute(
        "aria-sort",
        "ascending",
      ),
    );
    expect(api.calls.length).toBeGreaterThan(0);
  });

  it("shows a designed empty state", async () => {
    fakeApi().on("GET", "/applications", page([]));
    renderRoutes(routes, "/applications?view=table");
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add your first application/ })).toBeInTheDocument();
  });
});
