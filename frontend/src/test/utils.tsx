/* Test helpers: a fake API (replaces fetch) and a renderer with app providers. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import type { Meta, User } from "@/lib/types";

type Handler = (body: unknown, url: URL) => unknown;

export interface FakeApi {
  calls: { method: string; path: string; body: unknown }[];
  /** `handler` is a response body, `{ status, body }`, or a function returning either. */
  on: (method: string, path: string | RegExp, handler: unknown) => FakeApi;
}

export function fakeApi(): FakeApi {
  const routes: { method: string; path: string | RegExp; handler: unknown }[] = [];
  const calls: FakeApi["calls"] = [];
  const api: FakeApi = {
    calls,
    on(method, path, handler) {
      routes.unshift({ method, path, handler });
      return api;
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const method = init?.method ?? "GET";
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      calls.push({ method, path, body });
      if (path === "/auth/csrf") {
        document.cookie = "av_csrftoken=test-token";
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      const route = routes.find(
        (r) =>
          r.method === method && (typeof r.path === "string" ? r.path === path : r.path.test(path)),
      );
      if (!route) {
        return new Response(
          JSON.stringify({
            error: { code: "not_found", message: `No fake for ${method} ${path}`, details: {} },
          }),
          { status: 404 },
        );
      }
      const result =
        typeof route.handler === "function" ? (route.handler as Handler)(body, url) : route.handler;
      const wrapped =
        // `{ status: <number>, body }` is a wrapper; records with a string `status` field are bodies.
        result &&
        typeof result === "object" &&
        "status" in result &&
        typeof result.status === "number"
          ? (result as { status: number; body?: unknown })
          : { status: 200, body: result };
      if (wrapped.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(wrapped.body ?? {}), {
        status: wrapped.status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return api;
}

export const testUser: User = {
  id: "u1",
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  timezone: "UTC",
  email_notifications: true,
  is_email_verified: true,
  ai_acknowledged_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

export const testMeta: Meta = {
  statuses: [
    "Saved",
    "Preparing",
    "Applied",
    "Assessment",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
  ].map((label) => ({ value: label.toLowerCase(), label })),
  employment_types: [{ value: "full_time", label: "Full-time" }],
  work_arrangements: [
    { value: "remote", label: "Remote" },
    { value: "hybrid", label: "Hybrid" },
    { value: "onsite", label: "On-site" },
  ],
  document_types: [
    { value: "cv", label: "CV" },
    { value: "cover_letter", label: "Cover letter" },
    { value: "certificate", label: "Certificate" },
    { value: "portfolio", label: "Portfolio" },
    { value: "transcript", label: "Transcript" },
    { value: "other", label: "Other" },
  ],
  image_document_types: ["certificate", "portfolio"],
  reminder_types: [
    { value: "follow_up", label: "Follow-up" },
    { value: "interview", label: "Interview" },
    { value: "deadline", label: "Deadline" },
  ],
  activity_types: [],
  manual_activity_types: ["note", "follow_up", "email", "call", "interview", "assessment", "other"],
  max_upload_bytes: 10 * 1024 * 1024,
  ai_daily_limit: 25,
};

export function renderRoutes(
  routes: RouteObject[],
  initialPath: string,
  { user = testUser }: { user?: User | null } = {},
): RenderResult & { client: QueryClient; router: ReturnType<typeof createMemoryRouter> } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(["me"], user);
  client.setQueryData(["meta"], testMeta);
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, router };
}

export function renderPage(element: ReactNode, path = "/", initialPath = path) {
  return renderRoutes(
    [
      { path, element },
      { path: "*", element: <div>Other page</div> },
    ],
    initialPath,
  );
}
