import { expect, test, type Locator, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 }, timezoneId: "UTC" });

type ServerTask = { content: string; isCompleted: boolean; dueDate: string | null; deletedAt: string | null };

const row = (page: Page, content: string): Locator => page.getByRole("group", { name: `Task: ${content}`, exact: true });

test("Completed, Trash and search work offline and reach the server afterwards", async ({ page }) => {
  await registerAndLogin(page, `offline-views-${Date.now()}-${test.info().workerIndex}`);
  const today = new Date().toISOString().slice(0, 10);
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string; isInbox: boolean }[];
  const inbox = projects.find((project) => project.isInbox)!;
  for (const content of ["Pay the gas bill", "Water the plants", "Old receipt"]) {
    const response = await page.request.post("/api/tasks", { data: { projectId: inbox.id, content, dueDate: today } });
    expect(response.ok()).toBe(true);
  }

  await page.goto("/today");
  await expect(row(page, "Water the plants")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Visited online under the worker, so each page is cached at its own address. The search is
  // cached before the task it should find exists.
  for (const path of ["/today", "/completed", "/trash", "/search?q=dentist"]) {
    await page.goto(path);
    await page.reload();
  }

  await page.goto("/today");
  await page.context().setOffline(true);
  const note = page.getByRole("button", { name: /^You're offline/ });
  await expect(note).toBeVisible();

  // Quick add takes "today" as the date and leaves it out of the name.
  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "Task name" }).fill("Call the dentist today");
  await page.keyboard.press("Enter");
  await expect(row(page, "Call the dentist")).toBeVisible();

  await row(page, "Water the plants").getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(row(page, "Water the plants")).toHaveCount(0);

  await row(page, "Old receipt").getByRole("button", { name: "More task actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await expect(row(page, "Old receipt")).toHaveCount(0);
  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(3);

  // The completed task is listed under Completed.
  await page.goto("/completed");
  await expect(page.getByText("Water the plants", { exact: true })).toBeVisible();
  await expect(page.getByText("Old receipt", { exact: true })).toHaveCount(0);

  // The trashed task comes back from Trash.
  await page.goto("/trash");
  await expect(page.getByText("Old receipt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(4);

  // Search finds the task created offline.
  await page.goto("/search?q=dentist");
  await expect(page.getByRole("heading", { name: "Tasks (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Call the dentist/ })).toBeVisible();

  await page.context().setOffline(false);
  await expect(note).toBeHidden();
  await expect.poll(async () => {
    const response = await page.request.get("/api/v1/tasks?limit=100");
    const { items } = (await response.json()) as { items: ServerTask[] };
    const find = (content: string) => items.find((task) => task.content === content && task.deletedAt === null);
    return {
      added: find("Call the dentist")?.dueDate,
      watered: find("Water the plants")?.isCompleted,
      restored: find("Old receipt") !== undefined,
    };
  }, { timeout: 30_000 }).toEqual({ added: today, watered: true, restored: true });
});
