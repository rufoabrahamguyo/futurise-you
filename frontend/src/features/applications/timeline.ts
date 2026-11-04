import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Activity, Page, Question } from "@/lib/types";

export const activityKey = (id: string) => ["activities", id] as const;
export const questionKey = (id: string) => ["questions", id] as const;

export function useActivities(applicationId: string) {
  return useQuery({
    queryKey: activityKey(applicationId),
    queryFn: () =>
      api.get<Page<Activity>>(`/applications/${applicationId}/activities`, { page_size: 200 }),
  });
}

export interface ActivityInput {
  type?: string;
  title?: string;
  body?: string;
  occurred_at?: string;
}

function useInvalidateTimeline(applicationId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: activityKey(applicationId) });
    void qc.invalidateQueries({ queryKey: ["applications"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useAddActivity(applicationId: string) {
  const invalidate = useInvalidateTimeline(applicationId);
  return useMutation({
    mutationFn: (input: ActivityInput) =>
      api.post<Activity>(`/applications/${applicationId}/activities`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity(applicationId: string) {
  const invalidate = useInvalidateTimeline(applicationId);
  return useMutation({
    mutationFn: ({ id, ...input }: ActivityInput & { id: string }) =>
      api.patch<Activity>(`/applications/${applicationId}/activities/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity(applicationId: string) {
  const invalidate = useInvalidateTimeline(applicationId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${applicationId}/activities/${id}`),
    onSuccess: invalidate,
  });
}

export function useQuestions(applicationId: string) {
  return useQuery({
    queryKey: questionKey(applicationId),
    queryFn: () => api.get<Question[]>(`/applications/${applicationId}/questions`),
  });
}

export function useQuestionMutations(applicationId: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: questionKey(applicationId) });
  return {
    create: useMutation({
      mutationFn: (input: { question: string; answer: string }) =>
        api.post<Question>(`/applications/${applicationId}/questions`, input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...input
      }: {
        id: string;
        question?: string;
        answer?: string;
        order?: number;
      }) => api.patch<Question>(`/applications/${applicationId}/questions/${id}`, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/applications/${applicationId}/questions/${id}`),
      onSuccess: invalidate,
    }),
  };
}
