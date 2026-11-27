import { expect, test, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin, waitForSync } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 } });

const row = (page: Page, content: string) => page.getByRole("group", { name: `Task: ${content}`, exact: true });

async function openProject(page: Page, name: string, tasks: string[]) {
  const created = await page.request.post("/api/projects", { data: { name, color: "blue" } });
  expect(created.ok()).toBe(true);
  const project = (await created.json()) as { id: string };
  const ids: Record<string, string> = {};
  for (const content of tasks) {
    const response = await page.request.post("/api/tasks", { data: { projectId: project.id, content } });
    expect(response.ok()).toBe(true);
    ids[content] = ((await response.json()) as { id: string }).id;
  }
  await page.goto(`/projects/${project.id}`);
  await expect(row(page, tasks[0])).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Reloaded under the worker, so this page is cached.
  await page.reload();
  await expect(row(page, tasks[0])).toBeVisible();
  await waitForSync(page);
  return { projectId: project.id, ids };
}

test("a task changed here and elsewhere asks which version to keep", async ({ page }) => {
  await registerAndLogin(page, `offline-conflict-${Date.now()}-${test.info().workerIndex}`);
  const { ids } = await openProject(page, "Conflicts", ["Original"]);

  await page.context().setOffline(true);
  await row(page, "Original").getByText("Original", { exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.locator("#task-dialog-title").click();
  await modal.getByRole("textbox").first().fill("Mine");
  await page.keyboard.press("Enter");
  await expect(modal.locator("#task-dialog-title")).toHaveText("Mine");
  await expect.poll(() => queuedChanges(page)).toBe(1);
  await page.keyboard.press("Escape");

  const elsewhere = await page.request.patch(`/api/v1/tasks/${ids.Original}`, { data: { content: "Theirs" } });
  expect(elsewhere.ok()).toBe(true);

  await page.context().setOffline(false);
  const review = page.getByRole("button", { name: "Review" });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await review.click();
  const conflict = page.getByRole("group", { name: "Changed on another device" });
  await expect(conflict).toContainText("This device: Mine");
  await expect(conflict).toContainText("Other device: Theirs");
  await conflict.getByRole("button", { name: "Keep mine" }).click();

  await expect(review).toBeHidden();
  await expect.poll(async () => {
    const task = (await (await page.request.get(`/api/v1/tasks/${ids.Original}`)).json()) as { content: string };
    return task.content;
  }, { timeout: 30_000 }).toBe("Mine");
});

test("a change the server rejects can be discarded", async ({ page }) => {
  await registerAndLogin(page, `offline-rejected-${Date.now()}-${test.info().workerIndex}`);
  const { projectId } = await openProject(page, "Going away", ["Stays"]);

  await page.context().setOffline(true);
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("Orphan");
  await page.keyboard.press("Enter");
  await expect(row(page, "Orphan")).toBeVisible();
  await expect.poll(() => queuedChanges(page)).toBe(1);

  // The project goes to Trash elsewhere, so the server has nowhere to put the new task.
  expect((await page.request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);

  await page.context().setOffline(false);
  const review = page.getByRole("button", { name: "Review" });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await review.click();
  const failure = page.getByRole("group", { name: "Couldn't sync" });
  await expect(failure).toContainText("project or task");
  await failure.getByRole("button", { name: "Discard" }).click();
  await expect(review).toBeHidden();
  await expect.poll(() => queuedChanges(page)).toBe(0);
});
