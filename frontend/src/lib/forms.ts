import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError, errorMessage } from "./api";

/**
 * Puts server validation errors on matching form fields. Returns a message for
 * errors that do not belong to a field (or null when all were placed).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  aliases: Partial<Record<string, Path<T>>> = {},
): string | null {
  if (!(error instanceof ApiError)) return errorMessage(error);
  const fieldErrors = error.fieldErrors();
  let unplaced: string | null = null;
  for (const [key, message] of Object.entries(fieldErrors)) {
    const target = (aliases[key] ?? key) as Path<T>;
    if (fields.includes(target)) setError(target, { type: "server", message });
    else unplaced ??= message;
  }
  if (Object.keys(fieldErrors).length === 0) return error.message;
  return unplaced;
}
