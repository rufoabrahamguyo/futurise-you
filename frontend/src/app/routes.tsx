import { Navigate, type RouteObject } from "react-router";

import { ApplicationDetailPage } from "@/features/applications/ApplicationDetailPage";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { NewApplicationPage } from "@/features/applications/NewApplicationPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DocumentLibraryPage } from "@/features/documents/DocumentLibraryPage";
import { RemindersPage } from "@/features/reminders/RemindersPage";

import { AppLayout } from "./AppLayout";
import { NotFoundPage, RouteErrorPage } from "./ErrorPages";
import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";

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
              { path: "/applications", element: <ApplicationsPage /> },
              { path: "/applications/new", element: <NewApplicationPage /> },
              { path: "/applications/:id", element: <ApplicationDetailPage /> },
              { path: "/documents", element: <DocumentLibraryPage /> },
              { path: "/reminders", element: <RemindersPage /> },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
