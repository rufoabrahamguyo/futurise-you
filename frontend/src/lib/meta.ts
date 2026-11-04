import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import type { Choice, Meta } from "./types";

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: () => api.get<Meta>("/meta"),
    staleTime: Infinity,
  });
}

export function labelFor(choices: Choice[] | undefined, value: string): string {
  const label = choices?.find((c) => c.value === value)?.label;
  if (label) return label;
  const readable = value.replace(/_/g, " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}
