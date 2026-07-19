import type {
  Comment,
  Label,
  Project,
  Reminder,
  Section,
  Task,
  TaskCreate,
  TaskPage,
  WorkspaceContext,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class TaskApiClient {
  constructor(
    private readonly options: {
      baseUrl: URL;
      token: string;
      timeoutMs: number;
      fetch?: typeof fetch;
    },
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const url = new URL(`/api/v1${path}`, this.options.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${this.options.token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : `Task API request failed with HTTP ${response.status}`;
        throw new ApiError(message, response.status, data);
      }
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError("Task API request timed out", 504, null);
      }
      throw new ApiError(
        error instanceof Error ? error.message : "Task API request failed",
        502,
        null,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  context() {
    return this.request<WorkspaceContext>("/context");
  }

  listProjects() {
    return this.request<Project[]>("/projects");
  }

  getProject(id: string) {
    return this.request<Project>(`/projects/${id}`);
  }

  createProject(input: { name: string; color?: string; icon?: string | null; parentId?: string | null }) {
    return this.request<Project>("/projects", { method: "POST", body: JSON.stringify(input) });
  }

  updateProject(id: string, input: Record<string, unknown>) {
    return this.request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  createSection(input: { projectId: string; name: string; afterId?: string | null }) {
    return this.request<Section>("/sections", { method: "POST", body: JSON.stringify(input) });
  }

  updateSection(id: string, input: Record<string, unknown>) {
    return this.request<Section>(`/sections/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  listTasks(query: Record<string, string | number | boolean | null | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const suffix = params.size ? `?${params}` : "";
    return this.request<TaskPage>(`/tasks${suffix}`);
  }

  getTask(id: string) {
    return this.request<Task>(`/tasks/${id}`);
  }

  createTask(input: TaskCreate, idempotencyKey?: string) {
    return this.request<Task>(
      "/tasks",
      { method: "POST", body: JSON.stringify(input) },
      idempotencyKey,
    );
  }

  quickAddTask(text: string, idempotencyKey?: string) {
    return this.request<{ task: Task; parsed: unknown; warnings: string[] }>(
      "/tasks/quick-add",
      { method: "POST", body: JSON.stringify({ text }) },
      idempotencyKey,
    );
  }

  updateTask(id: string, input: Record<string, unknown>) {
    return this.request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  listLabels() {
    return this.request<Label[]>("/labels");
  }

  createLabel(input: { name: string; color?: string }) {
    return this.request<Label>("/labels", { method: "POST", body: JSON.stringify(input) });
  }

  addComment(input: { taskId?: string; projectId?: string; content: string }) {
    return this.request<Comment>("/comments", { method: "POST", body: JSON.stringify(input) });
  }

  createReminder(input: { taskId: string; remindAt: string }) {
    return this.request<Reminder>("/reminders", { method: "POST", body: JSON.stringify(input) });
  }
}
