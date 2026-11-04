import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ApplicationDocumentLink,
  DocumentVersion,
  DownloadLink,
  LibraryDocument,
  LibraryDocumentDetail,
  Page,
} from "@/lib/types";

export const documentKeys = {
  all: ["documents"] as const,
  list: (params: Record<string, string>) => ["documents", "list", params] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  links: (applicationId: string) => ["application-documents", applicationId] as const,
};

export function useDocuments(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: () => api.get<Page<LibraryDocument>>("/documents", { page_size: 200, ...params }),
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: documentKeys.detail(id ?? ""),
    queryFn: () => api.get<LibraryDocumentDetail>(`/documents/${id ?? ""}`),
    enabled: Boolean(id),
  });
}

function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: documentKeys.all });
    void qc.invalidateQueries({ queryKey: ["application-documents"] });
  };
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { title: string; type: string; file: File }) => {
      const form = new FormData();
      form.set("title", input.title);
      form.set("type", input.type);
      form.set("file", input.file);
      return api.post<LibraryDocumentDetail>("/documents", form);
    },
    onSuccess: invalidate,
  });
}

export function useUploadVersion() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ documentId, file }: { documentId: string; file: File }) => {
      const form = new FormData();
      form.set("file", file);
      return api.post<DocumentVersion>(`/documents/${documentId}/versions`, form);
    },
    onSuccess: invalidate,
  });
}

export function useRenameDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<LibraryDocument>(`/documents/${id}`, { title }),
    onSuccess: invalidate,
  });
}

export function useArchiveDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: invalidate,
  });
}

export function useApplicationDocuments(applicationId: string) {
  return useQuery({
    queryKey: documentKeys.links(applicationId),
    queryFn: () => api.get<ApplicationDocumentLink[]>(`/applications/${applicationId}/documents`),
  });
}

function useInvalidateApplication(applicationId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: documentKeys.links(applicationId) });
    void qc.invalidateQueries({ queryKey: ["applications"] });
    void qc.invalidateQueries({ queryKey: ["activities", applicationId] });
    void qc.invalidateQueries({ queryKey: documentKeys.all });
  };
}

export function useAttachVersion(applicationId: string) {
  const invalidate = useInvalidateApplication(applicationId);
  return useMutation({
    mutationFn: (input: { document_version_id: string; role: string }) =>
      api.post<ApplicationDocumentLink>(`/applications/${applicationId}/documents`, input),
    onSuccess: invalidate,
  });
}

export function useUploadAttachment(applicationId: string) {
  const invalidate = useInvalidateApplication(applicationId);
  return useMutation({
    mutationFn: (input: { file: File; role: string; title?: string; save_to_library: boolean }) => {
      const form = new FormData();
      form.set("file", input.file);
      form.set("role", input.role);
      if (input.title) form.set("title", input.title);
      form.set("save_to_library", String(input.save_to_library));
      return api.post<ApplicationDocumentLink>(
        `/applications/${applicationId}/documents/upload`,
        form,
      );
    },
    onSuccess: invalidate,
  });
}

export function useDetachDocument(applicationId: string) {
  const invalidate = useInvalidateApplication(applicationId);
  return useMutation({
    mutationFn: (linkId: string) =>
      api.delete(`/applications/${applicationId}/documents/${linkId}`),
    onSuccess: invalidate,
  });
}

/** Fetches a short-lived presigned URL, then downloads or opens it. */
export async function getDownloadLink(path: string, inline: boolean): Promise<DownloadLink> {
  return api.get<DownloadLink>(path, inline ? { inline: 1 } : undefined);
}

export async function downloadFile(path: string): Promise<void> {
  const link = await getDownloadLink(path, false);
  const anchor = document.createElement("a");
  anchor.href = link.url;
  anchor.rel = "noopener";
  anchor.download = link.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export const versionDownloadPath = (versionId: string) =>
  `/documents/versions/${versionId}/download`;
