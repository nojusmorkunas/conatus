import { expect, test, type Locator, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 } });

type ServerTask = { content: string; projectId: string; isCompleted: boolean; dueDate: string | null; order: string; deletedAt: string | null };

const row = (page: Page, content: string) => page.getByRole("group", { name: `Task: ${content}`, exact: true });

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

const names = (page: Page) =>
  page.locator("[data-task-content]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-task-content")));

async function serverTasks(page: Page, projectId: string) {
  const response = await page.request.get("/api/v1/tasks?limit=100");
  expect(response.ok()).toBe(true);
  const { items } = (await response.json()) as { items: ServerTask[] };
  return items.filter((task) => task.projectId === projectId && task.deletedAt === null);
}

test("a project keeps working offline and everything reaches the server afterwards", async ({ page }) => {
  await registerAndLogin(page, `offline-project-${Date.now()}-${test.info().workerIndex}`);
  const created = await page.request.post("/api/projects", { data: { name: "Offline work", color: "blue" } });
  expect(created.ok()).toBe(true);
  const project = (await created.json()) as { id: string };
  for (const content of ["Alpha", "Beta", "Gamma", "Delta"]) {
    const response = await page.request.post("/api/tasks", { data: { projectId: project.id, content } });
    expect(response.ok()).toBe(true);
  }

  await page.goto(`/projects/${project.id}`);
  await expect(row(page, "Delta")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Reloaded under the worker, so this page is cached.
  await page.reload();
  await expect(row(page, "Delta")).toBeVisible();

  await page.context().setOffline(true);
  const note = page.getByRole("button", { name: /^You're offline/ });
  await expect(note).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("Offline added");
  await page.keyboard.press("Enter");
  await expect(row(page, "Offline added")).toBeVisible();

  await row(page, "Beta").getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(row(page, "Beta")).toHaveCount(0);

  await row(page, "Gamma").getByRole("button", { name: "More task actions" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(row(page, "Gamma")).toContainText("Today");

  await row(page, "Delta").scrollIntoViewIfNeeded();
  const start = await box(row(page, "Delta"));
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + 18);
  await page.mouse.down();
  await page.mouse.move(x, start.y + 26, { steps: 3 });
  await expect(row(page, "Delta")).toHaveClass(/is-dragging/);
  const target = await box(row(page, "Alpha"));
  await page.mouse.move(x, target.y + 3, { steps: 15 });
  await expect(page.getByTestId("task-drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await expect.poll(() => names(page)).toEqual(["Delta", "Alpha", "Gamma", "Offline added"]);

  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(4);
  await page.reload();
  await expect(note).toBeVisible();
  await expect.poll(() => names(page)).toEqual(["Delta", "Alpha", "Gamma", "Offline added"]);
  await expect(row(page, "Gamma")).toContainText("Today");

  await page.context().setOffline(false);
  await expect(note).toBeHidden();
  await expect.poll(async () => {
    const tasks = await serverTasks(page, project.id);
    const byContent = new Map(tasks.map((task) => [task.content, task]));
    const open = tasks.filter((task) => !task.isCompleted).sort((a, b) => (a.order < b.order ? -1 : 1)).map((task) => task.content);
    return { open, beta: byContent.get("Beta")?.isCompleted, gammaDated: Boolean(byContent.get("Gamma")?.dueDate) };
  }, { timeout: 30_000 }).toEqual({ open: ["Delta", "Alpha", "Gamma", "Offline added"], beta: true, gammaDated: true });
});
