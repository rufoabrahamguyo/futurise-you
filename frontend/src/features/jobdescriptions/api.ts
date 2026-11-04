import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api";
import type { JobDescription } from "@/lib/types";

export const jdKey = (applicationId: string) => ["job-description", applicationId] as const;

/** The application's job description, or null when none has been saved. */
export function useJobDescription(applicationId: string) {
  return useQuery({
    queryKey: jdKey(applicationId),
    queryFn: async (): Promise<JobDescription | null> => {
      try {
        return await api.get<JobDescription>(`/applications/${applicationId}/job-description`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    // Poll while extraction is running.
    refetchInterval: (query) => {
      const status = query.state.data?.extraction_status;
      return status === "queued" || status === "processing" ? 2000 : false;
    },
  });
}

function useOnSaved(applicationId: string) {
  const qc = useQueryClient();
  return (jd: JobDescription) => {
    qc.setQueryData(jdKey(applicationId), jd);
    void qc.invalidateQueries({ queryKey: ["applications"] });
    void qc.invalidateQueries({ queryKey: ["activities", applicationId] });
  };
}

export function useSaveJobDescription(applicationId: string) {
  const onSaved = useOnSaved(applicationId);
  return useMutation({
    mutationFn: (input: { text: string } | { file: File }) => {
      if ("file" in input) {
        const form = new FormData();
        form.set("file", input.file);
        return api.post<JobDescription>(
          `/applications/${applicationId}/job-description/upload`,
          form,
        );
      }
      return api.post<JobDescription>(
        `/applications/${applicationId}/job-description/paste`,
        input,
      );
    },
    onSuccess: onSaved,
  });
}

export function useSupplementText(applicationId: string) {
  const onSaved = useOnSaved(applicationId);
  return useMutation({
    mutationFn: (text: string) =>
      api.post<JobDescription>(`/applications/${applicationId}/job-description/text`, { text }),
    onSuccess: onSaved,
  });
}

export const jdFilePath = (applicationId: string) =>
  `/applications/${applicationId}/job-description/file`;
