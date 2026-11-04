import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderRoutes, testUser } from "@/test/utils";

import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/dashboard", element: <h1>Dashboard</h1> },
];

describe("sign in", () => {
  it("signs in with a session cookie and CSRF token, then opens the dashboard", async () => {
    const api = fakeApi().on("POST", "/auth/login", testUser);
    renderRoutes(routes, "/login", { user: null });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    const login = api.calls.find((c) => c.path === "/auth/login");
    expect(login?.body).toEqual({ email: "ada@example.com", password: "secret-password" });
    // No tokens are stored in JavaScript-accessible storage.
    expect(window.localStorage.length).toBe(0);
  });

  it("shows the server's message when credentials are wrong", async () => {
    fakeApi().on("POST", "/auth/login", {
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Email or password is incorrect.",
          details: { non_field_errors: ["Email or password is incorrect."] },
        },
      },
    });
    renderRoutes(routes, "/login", { user: null });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("validates fields before calling the server", async () => {
    const api = fakeApi();
    renderRoutes(routes, "/login", { user: null });
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});

describe("register", () => {
  it("creates the account with the browser time zone", async () => {
    const api = fakeApi().on("POST", "/auth/register", { status: 201, body: testUser });
    renderRoutes(routes, "/register", { user: null });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Full name/), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-passphrase");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    const body = api.calls.find((c) => c.path === "/auth/register")?.body as Record<string, string>;
    expect(body.email).toBe("ada@example.com");
    expect(body.timezone).toBeTruthy();
  });

  it("puts server field errors on the matching field", async () => {
    fakeApi().on("POST", "/auth/register", {
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "An account with this email already exists.",
          details: { email: ["An account with this email already exists."] },
        },
      },
    });
    renderRoutes(routes, "/register", { user: null });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-passphrase");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByText("An account with this email already exists.")).toBeInTheDocument();
  });
});
