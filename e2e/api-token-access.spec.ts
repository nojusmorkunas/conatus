import { expect, test } from "@playwright/test";

import { registerAndLogin } from "./helpers";

test("a token limited to projects only reaches those projects and their sub-projects", async ({ page, request }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-limits`);

  const workResponse = await page.request.post("/api/projects", { data: { name: "Work" } });
  expect(workResponse.status()).toBe(201);
  const work = await workResponse.json();
  const clientsResponse = await page.request.post("/api/projects", { data: { name: "Clients", parentId: work.id } });
  expect(clientsResponse.status()).toBe(201);
  const clients = await clientsResponse.json();
  const homeResponse = await page.request.post("/api/projects", { data: { name: "Home" } });
  expect(homeResponse.status()).toBe(201);
  const home = await homeResponse.json();

  const workTaskResponse = await page.request.post("/api/tasks", { data: { projectId: work.id, content: "Work task" } });
  expect(workTaskResponse.status()).toBe(201);
  const workTask = await workTaskResponse.json();
  const clientTaskResponse = await page.request.post("/api/tasks", { data: { projectId: clients.id, content: "Client task" } });
  expect(clientTaskResponse.status()).toBe(201);
  const clientTask = await clientTaskResponse.json();
  const homeTaskResponse = await page.request.post("/api/tasks", { data: { projectId: home.id, content: "Home task" } });
  expect(homeTaskResponse.status()).toBe(201);
  const homeTask = await homeTaskResponse.json();

  const sectionResponse = await page.request.post("/api/sections", { data: { projectId: home.id, name: "Home section" } });
  expect(sectionResponse.status()).toBe(201);
  const homeSection = await sectionResponse.json();
  const commentResponse = await page.request.post("/api/comments", { data: { taskId: homeTask.id, content: "Home comment" } });
  expect(commentResponse.status()).toBe(201);
  const homeComment = await commentResponse.json();
  const remindAt = new Date(Date.now() - 3_600_000).toISOString();
  const homeReminderResponse = await page.request.post("/api/reminders", { data: { taskId: homeTask.id, remindAt } });
  expect(homeReminderResponse.status()).toBe(201);
  const homeReminder = await homeReminderResponse.json();
  const workReminderResponse = await page.request.post("/api/reminders", { data: { taskId: workTask.id, remindAt } });
  expect(workReminderResponse.status()).toBe(201);
  const workReminder = await workReminderResponse.json();

  const tokenResponse = await page.request.post("/api/tokens", {
    data: {
      name: "Work API",
      scopes: [
        "tasks:read", "tasks:write", "tasks:delete",
        "projects:read", "projects:write", "projects:delete",
        "labels:read", "labels:write", "labels:delete",
        "comments:read", "comments:write", "comments:delete",
        "reminders:read", "reminders:write", "reminders:delete",
      ],
      projectIds: [work.id],
    },
  });
  expect(tokenResponse.status()).toBe(201);
  const { token } = await tokenResponse.json();
  const headers = { Authorization: `Bearer ${token}` };

  const context = await request.get("/api/v1/context", { headers });
  expect(context.status()).toBe(200);
  expect((await context.json()).inbox).toBeNull();

  const projects = await request.get("/api/v1/projects", { headers });
  expect(projects.status()).toBe(200);
  expect((await projects.json()).map((project: { id: string }) => project.id).sort()).toEqual([work.id, clients.id].sort());
  expect((await request.get(`/api/v1/projects/${home.id}`, { headers })).status()).toBe(404);
  expect((await request.get(`/api/v1/projects/${clients.id}`, { headers })).status()).toBe(200);

  const tasks = await request.get("/api/v1/tasks?limit=100", { headers });
  expect(tasks.status()).toBe(200);
  expect((await tasks.json()).items.map((task: { content: string }) => task.content).sort()).toEqual(["Client task", "Work task"]);
  expect((await request.get(`/api/v1/tasks/${homeTask.id}`, { headers })).status()).toBe(404);
  expect((await request.patch(`/api/v1/tasks/${homeTask.id}`, { headers, data: { content: "x" } })).status()).toBe(404);
  expect((await request.delete(`/api/v1/tasks/${homeTask.id}`, { headers })).status()).toBe(404);
  expect((await request.post("/api/v1/tasks", { headers, data: { projectId: home.id, content: "Hidden task" } })).status()).toBe(404);
  expect((await request.patch(`/api/v1/tasks/${workTask.id}`, { headers, data: { projectId: home.id } })).status()).toBe(404);
  expect((await request.post("/api/v1/tasks", { headers, data: { projectId: clients.id, content: "New client task" } })).status()).toBe(201);

  expect((await request.get(`/api/v1/sections?projectId=${home.id}`, { headers })).status()).toBe(404);
  expect((await request.patch(`/api/v1/sections/${homeSection.id}`, { headers, data: { name: "x" } })).status()).toBe(404);
  expect((await request.delete(`/api/v1/sections/${homeSection.id}`, { headers })).status()).toBe(404);

  expect((await request.get(`/api/v1/comments?taskId=${homeTask.id}`, { headers })).status()).toBe(404);
  expect((await request.patch(`/api/v1/comments/${homeComment.id}`, { headers, data: { content: "x" } })).status()).toBe(404);
  expect((await request.delete(`/api/v1/comments/${homeComment.id}`, { headers })).status()).toBe(404);

  expect((await request.get(`/api/v1/reminders?taskId=${homeTask.id}`, { headers })).status()).toBe(404);
  expect((await request.patch(`/api/v1/reminders/${homeReminder.id}`, { headers, data: { seen: true } })).status()).toBe(404);
  expect((await request.delete(`/api/v1/reminders/${homeReminder.id}`, { headers })).status()).toBe(404);
  const due = await request.get("/api/v1/reminders?due=1", { headers });
  expect(due.status()).toBe(200);
  const dueIds = (await due.json()).map((reminder: { id: string }) => reminder.id);
  expect(dueIds).toContain(workReminder.id);
  expect(dueIds).not.toContain(homeReminder.id);

  expect((await request.post("/api/v1/projects", { headers, data: { name: "Top level" } })).status()).toBe(403);
  const nestedResponse = await request.post("/api/v1/projects", { headers, data: { name: "Nested", parentId: work.id } });
  expect(nestedResponse.status()).toBe(201);
  const nested = await nestedResponse.json();
  expect((await request.get(`/api/v1/projects/${nested.id}`, { headers })).status()).toBe(200);
  expect((await request.patch(`/api/v1/projects/${clients.id}`, { headers, data: { parentId: null } })).status()).toBe(403);
  expect((await request.patch(`/api/v1/projects/${clients.id}`, { headers, data: { parentId: home.id } })).status()).toBe(403);

  const noInbox = await request.post("/api/v1/tasks/quick-add", { headers, data: { text: "Buy milk" } });
  expect(noInbox.status()).toBe(400);
  await expect(noInbox.json()).resolves.toMatchObject({ error: "This token can't add tasks to Inbox. Add a #project to the text." });
  expect((await request.post("/api/v1/tasks/quick-add", { headers, data: { text: "Fix the sink #Home" } })).status()).toBe(400);
  const quickAdd = await request.post("/api/v1/tasks/quick-add", { headers, data: { text: "Plan the sprint #Work" } });
  expect(quickAdd.status()).toBe(201);
  expect((await quickAdd.json()).task.projectId).toBe(work.id);

  expect((await page.request.delete(`/api/tasks/${homeTask.id}`)).status()).toBe(200);
  expect((await page.request.delete(`/api/tasks/${clientTask.id}`)).status()).toBe(200);
  expect((await request.post(`/api/trash/tasks/${homeTask.id}/restore`, { headers })).status()).toBe(404);
  expect((await request.post(`/api/trash/tasks/${clientTask.id}/restore`, { headers })).status()).toBe(200);
  expect((await page.request.delete(`/api/projects/${home.id}`)).status()).toBe(200);
  expect((await request.post(`/api/trash/projects/${home.id}/restore`, { headers })).status()).toBe(404);

  expect((await request.get("/api/v1/labels", { headers })).status()).toBe(200);
});

test("deleting sections and labels needs the delete permissions", async ({ page, request }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-delete`);
  const inboxHref = await page.getByRole("link", { name: "Inbox" }).getAttribute("href");
  const projectId = inboxHref?.split("/").at(-1);
  expect(projectId).toBeTruthy();

  const tokenAResponse = await page.request.post("/api/tokens", {
    data: { name: "Write API", scopes: ["projects:read", "projects:write", "labels:read", "labels:write"] },
  });
  expect(tokenAResponse.status()).toBe(201);
  const tokenA = await tokenAResponse.json();
  const headersA = { Authorization: `Bearer ${tokenA.token}` };

  const sectionResponse = await request.post("/api/v1/sections", { headers: headersA, data: { projectId, name: "Section" } });
  expect(sectionResponse.status()).toBe(201);
  const section = await sectionResponse.json();
  const labelResponse = await request.post("/api/v1/labels", { headers: headersA, data: { name: "Label" } });
  expect(labelResponse.status()).toBe(201);
  const label = await labelResponse.json();
  expect((await request.delete(`/api/v1/sections/${section.id}`, { headers: headersA })).status()).toBe(401);
  expect((await request.delete(`/api/v1/labels/${label.id}`, { headers: headersA })).status()).toBe(401);

  const tokenBResponse = await page.request.post("/api/tokens", {
    data: { name: "Delete API", scopes: ["projects:delete", "labels:delete"] },
  });
  expect(tokenBResponse.status()).toBe(201);
  const tokenB = await tokenBResponse.json();
  const headersB = { Authorization: `Bearer ${tokenB.token}` };
  expect((await request.delete(`/api/v1/sections/${section.id}`, { headers: headersB })).status()).toBe(200);
  expect((await request.delete(`/api/v1/labels/${label.id}`, { headers: headersB })).status()).toBe(200);
});

test("token permissions, projects and expiry can change after creation", async ({ page, request }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-edit`);
  const inboxHref = await page.getByRole("link", { name: "Inbox" }).getAttribute("href");
  const inbox = inboxHref?.split("/").at(-1);
  expect(inbox).toBeTruthy();

  const homeResponse = await page.request.post("/api/projects", { data: { name: "Home" } });
  expect(homeResponse.status()).toBe(201);
  const home = await homeResponse.json();
  const tokenResponse = await page.request.post("/api/tokens", {
    data: {
      name: "Read API",
      scopes: ["tasks:read"],
      projectIds: [inbox],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  expect(tokenResponse.status()).toBe(201);
  const { id, token } = await tokenResponse.json();
  const headers = { Authorization: `Bearer ${token}` };
  const taskData = { projectId: home.id, content: "Home task" };
  expect((await request.post("/api/v1/tasks", { headers, data: taskData })).status()).toBe(401);

  const updated = await page.request.patch(`/api/tokens/${id}`, {
    data: { name: "Renamed", scopes: ["tasks:read", "tasks:write"], projectIds: null, expiresAt: null },
  });
  expect(updated.status()).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    name: "Renamed",
    scopes: ["tasks:read", "tasks:write"],
    projectIds: null,
    expiresAt: null,
  });
  expect((await request.post("/api/v1/tasks", { headers, data: taskData })).status()).toBe(201);

  for (const data of [
    { scopes: [] },
    { projectIds: [] },
    {},
    { expiresAt: new Date(Date.now() - 3_600_000).toISOString() },
    { projectIds: [crypto.randomUUID()] },
  ]) {
    expect((await page.request.patch(`/api/tokens/${id}`, { data })).status()).toBe(400);
  }

  const tokens = await page.request.get("/api/tokens");
  expect(tokens.status()).toBe(200);
  await expect(tokens.json()).resolves.toContainEqual(expect.objectContaining({ id, projectIds: null }));
  expect((await page.request.delete(`/api/tokens/${id}`)).status()).toBe(200);
  expect((await page.request.patch(`/api/tokens/${id}`, { data: { name: "Revoked" } })).status()).toBe(404);
  expect((await request.get("/api/v1/tasks", { headers })).status()).toBe(401);
});
