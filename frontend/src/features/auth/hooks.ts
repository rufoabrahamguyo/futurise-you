import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api";
import type { User } from "@/lib/types";

export const meKey = ["me"] as const;

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api.get<User>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403))
          return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Signed-in user for components rendered inside RequireAuth. */
export function useCurrentUser(): User {
  const { data } = useMe();
  if (!data) throw new Error("useCurrentUser used outside an authenticated route");
  return data;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<User>("/auth/login", input),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; full_name: string; timezone: string }) =>
      api.post<User>("/auth/register", input),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>("/auth/logout"),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(meKey, null);
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Pick<User, "full_name" | "timezone" | "email_notifications">>) =>
      api.patch<User>("/auth/me", input),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
