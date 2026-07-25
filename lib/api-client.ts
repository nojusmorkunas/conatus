// Routes return errors in one of two shapes: a plain string (`{ error: "..." }`)
// or, for Zod validation failures, a field map (`{ error: { name: ["Required"] } }`,
// i.e. `parsed.error.flatten().fieldErrors`). ApiError normalizes both into a
// single message while keeping the field map around for callers that want it.

export type FieldErrors = Record<string, string[] | undefined>;

export class ApiError extends Error {
  status: number;
  fields?: FieldErrors;

  constructor(status: number, message: string, fields?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function describeError(status: number, payload: unknown): { message: string; fields?: FieldErrors } {
  const error = (payload as { error?: unknown } | null)?.error;

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    const fields = error as FieldErrors;
    const firstMessage = Object.values(fields)
      .flat()
      .find((message): message is string => Boolean(message));
    return { message: firstMessage ?? "The request was invalid.", fields };
  }

  return { message: `Request failed with status ${status}` };
}

async function handle<T>(response: Response): Promise<T> {
  const payload = await readJson(response);
  if (!response.ok) {
    const { message, fields } = describeError(response.status, payload);
    throw new ApiError(response.status, message, fields);
  }
  return payload as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method };
  if (body instanceof FormData) return { method, body };
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  return handle<T>(response);
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) => request<T>(url, jsonInit("POST", body)),
  patch: <T>(url: string, body?: unknown) => request<T>(url, jsonInit("PATCH", body)),
  put: <T>(url: string, body?: unknown) => request<T>(url, jsonInit("PUT", body)),
  delete: <T>(url: string, body?: unknown) => request<T>(url, jsonInit("DELETE", body)),
};
