import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  Application,
  ApplicationInput,
  ApplicationSummary,
  Page,
  StatusChangeResult,
} from "@/lib/types";

export interface ApplicationFilters {
  q?: string;
  status?: string;
  ordering?: string;
  work_arrangement?: string;
  employment_type?: string;
  deadline_after?: string;
  deadline_before?: string;
  trash?: "1";
  page?: number;
  page_size?: number;
}

export const applicationKeys = {
  all: ["applications"] as const,
  list: (filters: ApplicationFilters) => ["applications", "list", filters] as const,
  detail: (id: string) => ["applications", "detail", id] as const,
};

export function useApplications(filters: ApplicationFilters) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Page<ApplicationSummary>>("/applications", { ...filters }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: () => api.get<Application>(`/applications/${id}`),
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => api.post<Application>("/applications", input),
    onSuccess: (app) => {
      qc.setQueryData(applicationKeys.detail(app.id), app);
      void qc.invalidateQueries({ queryKey: applicationKeys.all });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateApplication(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => api.patch<Application>(`/applications/${id}`, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: applicationKeys.detail(id) });
      const previous = qc.getQueryData<Application>(applicationKeys.detail(id));
      if (previous) {
        const { company_id: _c, company_name: _n, ...fields } = input;
        qc.setQueryData<Application>(applicationKeys.detail(id), { ...previous, ...fields });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(applicationKeys.detail(id), context.previous);
    },
    onSuccess: (app) => qc.setQueryData(applicationKeys.detail(id), app),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["applications", "list"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** Status change with optimistic update across the detail and every cached list. */
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      api.post<StatusChangeResult>(`/applications/${id}/status`, { status, note: note ?? "" }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: applicationKeys.all });
      const lists = qc.getQueriesData<Page<ApplicationSummary>>({
        queryKey: ["applications", "list"],
      });
      const detail = qc.getQueryData<Application>(applicationKeys.detail(id));
      for (const [key, page] of lists) {
        if (!page) continue;
        qc.setQueryData<Page<ApplicationSummary>>(key, {
          ...page,
          results: page.results.map((a) => (a.id === id ? { ...a, status } : a)),
        });
      }
      if (detail) qc.setQueryData<Application>(applicationKeys.detail(id), { ...detail, status });
      return { lists, detail };
    },
    onError: (_error, { id }, context) => {
      for (const [key, page] of context?.lists ?? []) qc.setQueryData(key, page);
      if (context?.detail) qc.setQueryData(applicationKeys.detail(id), context.detail);
    },
    onSuccess: (result) =>
      qc.setQueryData(applicationKeys.detail(result.application.id), result.application),
    onSettled: (_data, _error, { id }) => {
      void qc.invalidateQueries({ queryKey: applicationKeys.all });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["activities", id] });
      void qc.invalidateQueries({ queryKey: ["application-documents", id] });
    },
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: applicationKeys.all });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRestoreApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Application>(`/applications/${id}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: applicationKeys.all });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
