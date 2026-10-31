import { expect, test } from "@playwright/test";

import { registerAndLogin, testPassword } from "./helpers";

test("scoped v1 API supports context, idempotent creation, listing and scope denial", async ({ page, request }) => {
  const username = `e2e-${Date.now()}-api`;
  await registerAndLogin(page, username);

  const inboxHref = await page.getByRole("link", { name: "Inbox" }).getAttribute("href");
  const projectId = inboxHref?.split("/").at(-1);
  expect(projectId).toBeTruthy();

  const tokenResponse = await page.request.post("/api/tokens", {
    data: { name: "E2E API", scopes: ["tasks:read", "tasks:write"], expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  });
  expect(tokenResponse.status()).toBe(201);
  const { token } = await tokenResponse.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  const context = await request.get("/api/v1/context", { headers });
  expect(context.status()).toBe(200);
  // Registered without an email address, so the server can't email reminders.
  await expect(context.json()).resolves.toMatchObject({ apiVersion: "v1", user: { username, emailRemindersAvailable: false } });

  const createHeaders = { ...headers, "Idempotency-Key": "same-request" };
  const first = await request.post("/api/v1/tasks", {
    headers: createHeaders,
    data: { projectId, content: "Created through v1", priority: 2 },
  });
  const replay = await request.post("/api/v1/tasks", {
    headers: createHeaders,
    data: { projectId, content: "Created through v1", priority: 2 },
  });
  expect(first.status()).toBe(201);
  expect(replay.status()).toBe(201);
  expect((await replay.json()).id).toBe((await first.json()).id);

  const list = await request.get("/api/v1/tasks?completed=false&limit=10", { headers });
  expect(list.status()).toBe(200);
  await expect(list.json()).resolves.toMatchObject({
    items: [expect.objectContaining({ content: "Created through v1" })],
    nextCursor: null,
  });

  const forbidden = await request.post("/api/v1/projects", {
    headers,
    data: { name: "Should not be created" },
  });
  expect(forbidden.status()).toBe(401);

  const reminderDenied = await request.post("/api/v1/tasks/quick-add", {
    headers,
    data: { text: "Remind me September 15, 2027 at noon to call mom" },
  });
  expect(reminderDenied.status()).toBe(403);
  const unchanged = await request.get("/api/v1/tasks?completed=false&limit=10", { headers });
  expect((await unchanged.json()).items).toHaveLength(1);
});

test("NLP reminders use the account time zone and remain idempotent", async ({ page, request }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-nlp-api`);
  const settings = await page.request.patch("/api/settings", { data: { timezone: "Europe/Amsterdam", dateFormat: "dd/MM/yyyy", weekStart: 1, dailyGoal: 5, activityGraphSource: "completed" } });
  expect(settings.ok()).toBeTruthy();
  const tokenResponse = await page.request.post("/api/tokens", {
    data: { name: "NLP API", scopes: ["tasks:read", "tasks:write", "reminders:read", "reminders:write"], expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  });
  expect(tokenResponse.status()).toBe(201);
  const { token } = await tokenResponse.json();
  const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": "nlp-reminder" };
  const data = { text: "Remind me September 15, 2027 at noon to call mom" };
  const first = await request.post("/api/v1/tasks/quick-add", { headers, data });
  expect(first.status()).toBe(201);
  const result = await first.json();
  expect(result).toMatchObject({ task: { content: "call mom", dueDate: null, dueTime: null }, parsed: { reminderAt: "2027-09-15T12:00" }, warnings: [] });
  const replay = await request.post("/api/v1/tasks/quick-add", { headers, data });
  expect(replay.status()).toBe(201);
  expect((await replay.json()).task.id).toBe(result.task.id);
  const task = await request.get(`/api/v1/tasks/${result.task.id}`, { headers });
  expect(task.ok()).toBeTruthy();
  const details = await task.json();
  expect(details.reminders).toHaveLength(1);
  expect(details.reminders[0].remindAt).toBe("2027-09-15T10:00:00.000Z");
});

test("an app's creates are idempotent and its token revokes itself on sign-out", async ({ page, request }) => {
  const username = `e2e-${Date.now()}-device`;
  await registerAndLogin(page, username);
  const tokenResponse = await request.post("/api/v1/auth/device-token", {
    data: { username, password: testPassword, deviceName: "E2E phone" },
  });
  expect(tokenResponse.status()).toBe(201);
  const { token } = await tokenResponse.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  // A phone that lost the first response sends the same create again.
  async function createTwice(path: string, key: string, data: object) {
    const first = await request.post(path, { headers: { ...headers, "Idempotency-Key": key }, data });
    const replay = await request.post(path, { headers: { ...headers, "Idempotency-Key": key }, data });
    expect(first.status()).toBe(201);
    expect(replay.status()).toBe(201);
    const { id } = await first.json() as { id: string };
    expect((await replay.json()).id).toBe(id);
    return id;
  }
  const projectId = await createTwice("/api/v1/projects", "project", { name: "Made on a phone" });
  await createTwice("/api/v1/sections", "section", { projectId, name: "Later" });
  await createTwice("/api/v1/labels", "label", { name: "phone" });
  const projects = await (await request.get("/api/v1/projects", { headers })).json() as { name: string }[];
  expect(projects.filter((project) => project.name === "Made on a phone")).toHaveLength(1);

  const signOut = await request.delete("/api/v1/auth/device-token", { headers });
  expect(signOut.status()).toBe(204);
  expect((await request.get("/api/v1/context", { headers })).status()).toBe(401);
  const listed = await (await page.request.get("/api/tokens")).json() as { name: string }[];
  expect(listed.map((listedToken) => listedToken.name)).not.toContain("E2E phone");
});
