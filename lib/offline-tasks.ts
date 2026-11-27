export type OfflineTask = {
  key: string;
  // Replays must resend this byte-for-byte: the server hashes the body to detect key reuse.
  body: string;
  labelIds: string[];
  content: string;
  projectName: string | null;
  status: "pending" | "failed";
  error?: string;
  createdAt: string;
};

export type SyncResult = { synced: number; movedToInbox: string[] };

const CHANGE_EVENT = "offline-tasks:change";
let currentUser: string | null = null;
let running: Promise<SyncResult> | null = null;

export function setOfflineUser(userId: string) {
  currentUser = userId;
}

function storageKey() {
  return `conatus:offline-tasks:${currentUser}`;
}

export function readOfflineTasks(): OfflineTask[] {
  if (!currentUser) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(tasks: OfflineTask[]): boolean {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(tasks));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

// Replaces the task with `key`, or removes it when `next` is null.
function edit(key: string, next: OfflineTask | null) {
  save(readOfflineTasks().flatMap((task) => (task.key !== key ? [task] : next ? [next] : [])));
}

// crypto.randomUUID only exists in secure contexts, and self-hosters run over plain HTTP.
export function newIdempotencyKey(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function queueOfflineTask(input: { key: string; body: object; labelIds: string[]; content: string; projectName: string | null }): boolean {
  if (!currentUser) return false;
  const task: OfflineTask = {
    key: input.key,
    body: JSON.stringify(input.body),
    labelIds: input.labelIds,
    content: input.content,
    projectName: input.projectName,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  return save([...readOfflineTasks(), task]);
}

export function discardOfflineTask(key: string) {
  edit(key, null);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function postTask(task: OfflineTask): Promise<Response | null> {
  return fetch("/api/tasks", {
    method: "POST",
    headers: { ...JSON_HEADERS, "Idempotency-Key": task.key },
    body: task.body,
  }).catch(() => null);
}

// Statuses that mean "stop and retry later" rather than "this task is bad".
function stopsSync(response: Response) {
  return response.status === 401 || response.status === 409 || response.status === 429 || response.status >= 500;
}

async function run(inboxProjectId: string | null): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, movedToInbox: [] };
  for (const original of readOfflineTasks()) {
    if (original.status === "failed") continue;
    let task = original;
    let moved = false;
    let response = await postTask(task);
    if (!response || stopsSync(response)) break;

    // The project, section or parent was deleted: keep the task by moving it to Inbox.
    if (response.status === 404 && inboxProjectId) {
      const body = JSON.parse(task.body) as Record<string, unknown>;
      if (body.projectId !== inboxProjectId) {
        task = { ...task, key: `${task.key}:inbox`, body: JSON.stringify({ ...body, projectId: inboxProjectId, sectionId: undefined, parentId: undefined, afterId: undefined }) };
        edit(original.key, task);
        moved = true;
        response = await postTask(task);
        if (!response || stopsSync(response)) break;
      }
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
      const error = typeof payload?.error === "string" ? payload.error : "The server rejected this task.";
      edit(task.key, { ...task, status: "failed", error });
      continue;
    }

    const id = ((await response.json().catch(() => null)) as { id?: string } | null)?.id;
    if (!id) break;
    if (task.labelIds.length) {
      const patch = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ labelIds: task.labelIds }),
      }).catch(() => null);
      // Left pending: the next sync replays the idempotent POST, gets the same id and retries this PATCH.
      if (!patch || patch.status >= 500) break;
    }
    edit(task.key, null);
    result.synced++;
    if (moved) result.movedToInbox.push(task.content);
  }
  return result;
}

// A sync already in flight is shared, so overlapping triggers never send a task twice.
export function syncOfflineTasks(inboxProjectId: string | null): Promise<SyncResult> {
  running ??= run(inboxProjectId).finally(() => {
    running = null;
  });
  return running;
}
