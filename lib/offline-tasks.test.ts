import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discardOfflineTask, newIdempotencyKey, queueOfflineTask, readOfflineTasks, setOfflineUser, syncOfflineTasks } from "./offline-tasks";

const body = { projectId: "p1", sectionId: "s1", content: "Buy milk" };
const created = (id: string) => new Response(JSON.stringify({ id }), { status: 201 });
const failed = (status: number, error?: string) => new Response(JSON.stringify({ error }), { status });

function queue(content = "Buy milk", labelIds: string[] = [], key = newIdempotencyKey(), extra = {}) {
  return queueOfflineTask({ key, body: { ...body, ...extra, content }, labelIds, content, projectName: "Inbox" });
}

describe("offline task queue", () => {
  let store: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setOfflineUser("user-a");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes a synced task and replays the same key and body", async () => {
    expect(queue()).toBe(true);
    const [{ key, body: sent }] = readOfflineTasks();
    fetchMock.mockResolvedValueOnce(created("t1"));

    await expect(syncOfflineTasks(null)).resolves.toEqual({ synced: 1, movedToInbox: [] });

    expect(readOfflineTasks()).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks");
    expect(init.headers["Idempotency-Key"]).toBe(key);
    expect(init.body).toBe(sent);
  });

  it("keeps a task whose request never reached the server, and replays it later", async () => {
    queue();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(syncOfflineTasks(null)).resolves.toEqual({ synced: 0, movedToInbox: [] });
    expect(readOfflineTasks()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(created("t1"));
    await syncOfflineTasks(null);
    const [first, second] = fetchMock.mock.calls.map(([, init]) => init);
    expect(second.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(second.body).toBe(first.body);
    expect(readOfflineTasks()).toEqual([]);
  });

  it("keeps the key it was given", () => {
    queue("Buy milk", [], "k1");
    expect(readOfflineTasks()[0].key).toBe("k1");
  });

  it("makes v4-style keys without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(255) });
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("moves a task whose project is gone to Inbox under a new key", async () => {
    queue("Buy milk", [], undefined, { parentId: "x", afterId: "a1" });
    const [{ key }] = readOfflineTasks();
    fetchMock.mockResolvedValueOnce(failed(404, "Project not found"));
    fetchMock.mockResolvedValueOnce(created("t2"));

    await expect(syncOfflineTasks("inbox")).resolves.toEqual({ synced: 1, movedToInbox: ["Buy milk"] });

    const [, retry] = fetchMock.mock.calls[1];
    expect(retry.headers["Idempotency-Key"]).toBe(`${key}:inbox`);
    expect(JSON.parse(retry.body)).toEqual({ projectId: "inbox", content: "Buy milk" });
    expect(readOfflineTasks()).toEqual([]);
  });

  it("marks a rejected task failed with the server's message and continues", async () => {
    queue("Too long");
    queue("Fine");
    fetchMock.mockResolvedValueOnce(failed(400, "Task name is too long"));
    fetchMock.mockResolvedValueOnce(created("t3"));

    await expect(syncOfflineTasks(null)).resolves.toEqual({ synced: 1, movedToInbox: [] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tasks = readOfflineTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ content: "Too long", status: "failed", error: "Task name is too long" });
    discardOfflineTask(tasks[0].key);
    expect(readOfflineTasks()).toEqual([]);
  });

  it("keeps each account's tasks separate on one device", async () => {
    queue("Mine");
    setOfflineUser("user-b");
    expect(readOfflineTasks()).toEqual([]);
    queue("Theirs");
    setOfflineUser("user-a");
    expect(readOfflineTasks().map((task) => task.content)).toEqual(["Mine"]);
  });
});
