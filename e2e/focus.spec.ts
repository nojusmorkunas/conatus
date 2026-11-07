import { expect, test, type Page } from "@playwright/test";

import { registerAndLogin } from "./helpers";

test.use({ timezoneId: "UTC" });

async function inboxId(page: Page) {
  const response = await page.request.get("/api/projects");
  expect(response.status()).toBe(200);
  const projects = await response.json() as { id: string; isInbox: boolean }[];
  const inbox = projects.find((project) => project.isInbox);
  expect(inbox).toBeTruthy();
  return inbox!.id;
}

async function createProject(page: Page, name: string) {
  const response = await page.request.post("/api/projects", { data: { name } });
  expect(response.status()).toBe(201);
  return (await response.json() as { id: string }).id;
}

async function createTask(page: Page, projectId: string, data: Record<string, unknown>) {
  const response = await page.request.post("/api/tasks", { data: { projectId, ...data } });
  expect(response.status()).toBe(201);
}

test.beforeEach(async ({ page }, testInfo) => {
  await registerAndLogin(page, `e2e-${Date.now()}-${testInfo.workerIndex}-focus`);
});

test("Focus lists each day's timed tasks in time order, then the rest by priority", async ({ page }) => {
  const inbox = await inboxId(page);
  const family = await createProject(page, "Family");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Spread over two projects and created out of order, so neither creation
  // order nor manual order produces the expected list.
  await createTask(page, inbox, { content: "Clean garage", dueDate: today });
  await createTask(page, family, { content: "School pickup", dueDate: today, dueTime: "15:00" });
  await createTask(page, inbox, { content: "Organize pantry", dueDate: today, priority: 1 });
  await createTask(page, family, { content: "School drop-off", dueDate: today, dueTime: "08:15" });
  await createTask(page, inbox, { content: "Pay bill", dueDate: yesterday, dueTime: "18:00" });
  await createTask(page, family, { content: "Return library books", dueDate: yesterday, dueTime: "09:00" });

  await page.goto("/today");
  const rows = page.getByRole("group", { name: /^Task: / });
  await expect(rows).toHaveCount(6);
  expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")))).toEqual([
    "Task: Return library books",
    "Task: Pay bill",
    "Task: School drop-off",
    "Task: School pickup",
    "Task: Organize pantry",
    "Task: Clean garage",
  ]);
});
