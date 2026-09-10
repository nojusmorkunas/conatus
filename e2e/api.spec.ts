import { expect, test } from "@playwright/test";

import { registerAndLogin } from "./helpers";

test("scoped v1 API supports context, idempotent creation, listing and scope denial", async ({ page, request }) => {
  const username = `e2e-${Date.now()}-api`;
  await registerAndLogin(page, username);

  const inboxHref = await page.getByRole("link", { name: "Inbox" }).getAttribute("href");
  const projectId = inboxHref?.split("/").at(-1);
  expect(projectId).toBeTruthy();

  const tokenResponse = await page.request.post("/api/tokens", {
    data: { name: "E2E API", scopes: ["tasks:read", "tasks:write"], expiresInDays: 1 },
  });
  expect(tokenResponse.status()).toBe(201);
  const { token } = await tokenResponse.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  const context = await request.get("/api/v1/context", { headers });
  expect(context.status()).toBe(200);
  await expect(context.json()).resolves.toMatchObject({ apiVersion: "v1", user: { username } });

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
    data: { name: "NLP API", scopes: ["tasks:read", "tasks:write", "reminders:read", "reminders:write"], expiresInDays: 1 },
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
