/**
 * API client. Uses the session cookie (HttpOnly, set by the server) and echoes
 * the CSRF cookie in X-CSRFToken for unsafe methods. No tokens in JS storage.
 */

const BASE = "/api/v1";
const CSRF_COOKIE = "av_csrftoken";

export interface ApiErrorBody {
  code: string;
  message: string;
  details: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** Field errors from a validation response, flattened to one message per field. */
  fieldErrors(): Record<string, string> {
    if (this.code !== "validation_error" || typeof this.details !== "object" || !this.details) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.details as Record<string, unknown>)) {
      const first: unknown = Array.isArray(value) ? value[0] : value;
      if (typeof first === "string") out[key] = first;
    }
    return out;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<void> | null = null;

async function ensureCsrf(): Promise<string> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    csrfPromise ??= fetch(`${BASE}/auth/csrf`, { credentials: "same-origin" }).then(() => {
      csrfPromise = null;
    });
    await csrfPromise;
    token = readCookie(CSRF_COOKIE);
  }
  return token ?? "";
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method !== "GET") headers["X-CSRFToken"] = await ensureCsrf();

  const response = await fetch(`${BASE}${withQuery(path, options.query)}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const envelope = (data as { error?: ApiErrorBody } | undefined)?.error;
    throw new ApiError(
      response.status,
      envelope ?? {
        code: "http_error",
        message: "Something went wrong. Please try again.",
        details: {},
      },
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please check your connection and try again.";
}
