import { Navigate, type RouteObject } from "react-router";

import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";

import { AppLayout } from "./AppLayout";
import { NotFoundPage, RouteErrorPage } from "./ErrorPages";
import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";

// In-app pages load on demand so the first visit downloads only what it needs.
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <RedirectIfAuthed />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
          { path: "/forgot-password", element: <ForgotPasswordPage /> },
        ],
      },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/", element: <Navigate to="/dashboard" replace /> },
              { path: "/dashboard", element: <DashboardPage /> },
              {
                path: "/applications",
                lazy: async () => ({
                  Component: (await import("@/features/applications/ApplicationsPage"))
                    .ApplicationsPage,
                }),
              },
              {
                path: "/applications/new",
                lazy: async () => ({
                  Component: (await import("@/features/applications/NewApplicationPage"))
                    .NewApplicationPage,
                }),
              },
              {
                path: "/applications/:id",
                lazy: async () => ({
                  Component: (await import("@/features/applications/ApplicationDetailPage"))
                    .ApplicationDetailPage,
                }),
              },
              {
                path: "/documents",
                lazy: async () => ({
                  Component: (await import("@/features/documents/DocumentLibraryPage"))
                    .DocumentLibraryPage,
                }),
              },
              {
                path: "/reminders",
                lazy: async () => ({
                  Component: (await import("@/features/reminders/RemindersPage")).RemindersPage,
                }),
              },
              {
                path: "/analytics",
                lazy: async () => ({
                  Component: (await import("@/features/analytics/AnalyticsPage")).AnalyticsPage,
                }),
              },
              {
                path: "/settings",
                lazy: async () => ({
                  Component: (await import("@/features/settings/SettingsPage")).SettingsPage,
                }),
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
