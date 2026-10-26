import { expect, test, type Page } from "@playwright/test";

import { registerAndLogin } from "./helpers";

test.use({ timezoneId: "UTC" });

type Task = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
};

async function inboxId(page: Page) {
  const response = await page.request.get("/api/projects");
  expect(response.status()).toBe(200);
  const projects = await response.json() as { id: string; isInbox: boolean }[];
  const inbox = projects.find((project) => project.isInbox);
  expect(inbox).toBeTruthy();
  return inbox!.id;
}

async function createProject(page: Page) {
  const response = await page.request.post("/api/projects", { data: { name: "Target" } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string };
}

async function createTask(page: Page, projectId: string, data: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/tasks", {
    data: { projectId, content: "Task", ...data },
  });
  expect(response.status()).toBe(201);
  return await response.json() as Task;
}

async function patchTask(page: Page, taskId: string, data: Record<string, unknown>) {
  const response = await page.request.patch(`/api/tasks/${taskId}`, { data });
  expect(response.status()).toBe(200);
  return await response.json() as Task;
}

async function readTask(page: Page, taskId: string) {
  const response = await page.request.get(`/api/v1/tasks/${taskId}`);
  expect(response.status()).toBe(200);
  return await response.json() as Task;
}

test.beforeEach(async ({ page }, testInfo) => {
  await registerAndLogin(page, `e2e-${Date.now()}-${testInfo.workerIndex}-subtasks`);
});

test("moving a parent to another project carries its child and grandchild", async ({ page }) => {
  const projectId = await inboxId(page);
  const target = await createProject(page);
  const parent = await createTask(page, projectId);
  const child = await createTask(page, projectId, { parentId: parent.id });
  const grandchild = await createTask(page, projectId, { parentId: child.id });

  await patchTask(page, parent.id, { projectId: target.id });

  expect(await readTask(page, child.id)).toMatchObject({
    projectId: target.id, sectionId: null, parentId: parent.id,
  });
  expect(await readTask(page, grandchild.id)).toMatchObject({
    projectId: target.id, sectionId: null, parentId: child.id,
  });
});

test("moving a subtask alone detaches it from its parent", async ({ page }) => {
  const projectId = await inboxId(page);
  const target = await createProject(page);
  const parent = await createTask(page, projectId);
  const child = await createTask(page, projectId, { parentId: parent.id });

  await patchTask(page, child.id, { projectId: target.id });

  expect(await readTask(page, child.id)).toMatchObject({ projectId: target.id, parentId: null });
  expect(await readTask(page, parent.id)).toMatchObject({ projectId });
});

test("resending a subtask's own project leaves it in place", async ({ page }) => {
  const projectId = await inboxId(page);
  const sectionResponse = await page.request.post("/api/sections", { data: { projectId, name: "Section" } });
  expect(sectionResponse.status()).toBe(201);
  const section = await sectionResponse.json() as { id: string };
  const parent = await createTask(page, projectId, { sectionId: section.id });
  const child = await createTask(page, projectId, { parentId: parent.id });

  await patchTask(page, child.id, { projectId });

  expect(await readTask(page, child.id)).toMatchObject({
    projectId, sectionId: section.id, parentId: parent.id,
  });
});

test("reopening a parent preserves subtasks completed independently", async ({ page }) => {
  const projectId = await inboxId(page);
  const parent = await createTask(page, projectId);
  const open = await createTask(page, projectId, { parentId: parent.id });
  const earlier = await createTask(page, projectId, { parentId: parent.id });
  const completedEarlier = await patchTask(page, earlier.id, { completed: true });

  const completedParent = await patchTask(page, parent.id, { completed: true });
  expect(completedParent.completedAt).not.toBeNull();
  expect(completedParent.completedAt).not.toBe(completedEarlier.completedAt);
  expect(await readTask(page, open.id)).toMatchObject({
    isCompleted: true, completedAt: completedParent.completedAt,
  });
  expect(await readTask(page, earlier.id)).toMatchObject({
    isCompleted: true, completedAt: completedEarlier.completedAt,
  });

  await patchTask(page, parent.id, { completed: false });

  expect(await readTask(page, open.id)).toMatchObject({ isCompleted: false, completedAt: null });
  expect(await readTask(page, earlier.id)).toMatchObject({
    isCompleted: true, completedAt: completedEarlier.completedAt,
  });
});

test("reopening a subtask reopens its completed parent only", async ({ page }) => {
  const projectId = await inboxId(page);
  const parent = await createTask(page, projectId);
  const child = await createTask(page, projectId, { parentId: parent.id });
  const sibling = await createTask(page, projectId, { parentId: parent.id });
  await patchTask(page, parent.id, { completed: true });

  await patchTask(page, child.id, { completed: false });

  expect(await readTask(page, parent.id)).toMatchObject({ isCompleted: false, completedAt: null });
  expect(await readTask(page, child.id)).toMatchObject({ isCompleted: false, completedAt: null });
  expect(await readTask(page, sibling.id)).toMatchObject({ isCompleted: true });
});

test("advancing a recurring parent reopens its completed subtasks", async ({ page }) => {
  const projectId = await inboxId(page);
  const today = new Date().toISOString().slice(0, 10);
  const parent = await createTask(page, projectId, { dueDate: today, recurrence: "every day" });
  const child = await createTask(page, projectId, { parentId: parent.id });
  await patchTask(page, child.id, { completed: true });

  const advanced = await patchTask(page, parent.id, { completed: true });

  expect(advanced.isCompleted).toBe(false);
  expect(advanced.dueDate! > today).toBe(true);
  expect(await readTask(page, child.id)).toMatchObject({ isCompleted: false, completedAt: null });
});

test("creating a subtask under a completed parent is rejected", async ({ page }) => {
  const projectId = await inboxId(page);
  const parent = await createTask(page, projectId);
  await patchTask(page, parent.id, { completed: true });

  const response = await page.request.post("/api/tasks", {
    data: { projectId, parentId: parent.id, content: "Too late" },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Reopen the parent task first" });
});
