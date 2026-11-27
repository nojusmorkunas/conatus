import { ApiError } from "@/lib/api-client";

import type { CommentDto, FilterDto, LabelDto, ProjectDto, ReminderDto, SectionDto, TaskDto, TaskPage } from "./types";

// The parts of /api/v1 that sync uses, over the browser's own session.

/** The server answered with an error. */
export class HttpError extends ApiError {
  readonly serverMessage: string | null;
  /** The Retry-After header, in seconds, when there was one. */
  readonly retryAfter: string | null;

  constructor(status: number, serverMessage: string | null, retryAfter: string | null) {
    super(status, serverMessage ?? `The server answered with error ${status}.`);
    this.serverMessage = serverMessage;
    this.retryAfter = retryAfter;
  }
}

/** The request never got an answer: offline, or the server is unreachable. */
export class OfflineError extends Error {
  constructor(message = "Couldn't reach the server. Check your connection.") {
    super(message);
    this.name = "OfflineError";
  }
}

/** The server replies `{ "error": "..." }`, or field errors as an object for invalid input. */
export function errorMessageFrom(body: string): string | null {
  try {
    const error = (JSON.parse(body) as { error?: unknown } | null)?.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      // Field errors: each field with its messages. An empty object (the server lost the reason) reads as none.
      const text = Object.entries(error)
        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : String(messages)}`)
        .join("; ");
      return text || null;
    }
  } catch {}
  return null;
}

export type ConatusApi = {
  tasks(updatedSince: string | null, cursor: string | null): Promise<TaskPage>;
  task(id: string): Promise<TaskDto>;
  projects(): Promise<ProjectDto[]>;
  sections(): Promise<SectionDto[]>;
  labels(): Promise<LabelDto[]>;
  filters(): Promise<FilterDto[]>;
  comments(scope: { taskId: string } | { projectId: string }): Promise<CommentDto[]>;
  reminders(taskId: string): Promise<ReminderDto[]>;
  /** Sends [body] as it is, so a retry is byte-identical. Resolves to the parsed answer, null when it has none. */
  write(method: "POST" | "PATCH" | "DELETE", path: string, body?: string, idempotencyKey?: string | null): Promise<unknown>;
};

async function request(method: string, path: string, init: { body?: string; idempotencyKey?: string | null } = {}): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: init.body });
  } catch {
    throw new OfflineError();
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) throw new HttpError(response.status, errorMessageFrom(text), response.headers.get("Retry-After"));
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export const api: ConatusApi = {
  tasks(updatedSince, cursor) {
    const query = new URLSearchParams({ includeDeleted: "true", limit: "100" });
    if (updatedSince) query.set("updatedSince", updatedSince);
    if (cursor) query.set("cursor", cursor);
    return request("GET", `/api/v1/tasks?${query}`) as Promise<TaskPage>;
  },
  task: (id) => request("GET", `/api/v1/tasks/${id}`) as Promise<TaskDto>,
  projects: () => request("GET", "/api/v1/projects") as Promise<ProjectDto[]>,
  sections: () => request("GET", "/api/v1/sections") as Promise<SectionDto[]>,
  labels: () => request("GET", "/api/v1/labels") as Promise<LabelDto[]>,
  filters: () => request("GET", "/api/v1/filters") as Promise<FilterDto[]>,
  comments: (scope) => request("GET", `/api/v1/comments?${new URLSearchParams(scope)}`) as Promise<CommentDto[]>,
  reminders: (taskId) => request("GET", `/api/v1/reminders?${new URLSearchParams({ taskId })}`) as Promise<ReminderDto[]>,
  write: (method, path, body, idempotencyKey) => request(method, path, { body, idempotencyKey }),
};

/** What went wrong talking to the server, worded for the person using the app. */
export type ApiProblem = { kind: "offline" | "unauthorized" | "server"; message: string };

export function toApiProblem(error: unknown): ApiProblem {
  if (error instanceof HttpError) {
    if (error.status === 401) return { kind: "unauthorized", message: error.serverMessage ?? "The server didn't accept this sign-in." };
    if (error.status === 429) {
      const wait = Number(error.retryAfter);
      return { kind: "server", message: error.retryAfter && wait > 0 ? `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.` : "Too many attempts. Try again later." };
    }
    return { kind: "server", message: error.message };
  }
  if (error instanceof OfflineError) return { kind: "offline", message: error.message };
  return { kind: "server", message: "Something unexpected went wrong." };
}
