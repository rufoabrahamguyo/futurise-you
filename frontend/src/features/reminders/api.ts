import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Page, Reminder } from "@/lib/types";

export interface ReminderFilters {
  scope?: "upcoming" | "overdue" | "completed" | "cancelled" | "open";
  application?: string;
  from?: string;
  to?: string;
  page_size?: number;
}

export interface ReminderInput {
  application_id?: string;
  type?: string;
  title?: string;
  notes?: string;
  remind_at?: string;
  channels?: string[];
}

const KEY = ["reminders"] as const;

export function useReminders(filters: ReminderFilters, enabled = true) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: ({ signal }) => api.get<Page<Reminder>>("/reminders", { ...filters }, signal),
    enabled,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ReminderInput) => api.post<Reminder>("/reminders", input),
    onSuccess: invalidate,
  });
}

export function useUpdateReminder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: ReminderInput & { id: string }) =>
      api.patch<Reminder>(`/reminders/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReminderAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "complete" | "cancel" }) =>
      api.post<Reminder>(`/reminders/${id}/${action}`),
    onSuccess: invalidate,
  });
}
