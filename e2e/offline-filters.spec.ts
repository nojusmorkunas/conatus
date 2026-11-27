import { expect, test, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin, waitForSync } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 }, timezoneId: "UTC" });

type ServerFilter = { id: string; name: string; query: string };

const task = (page: Page, content: string) => page.getByRole("group", { name: `Task: ${content}`, exact: true });

test("filters change offline and reach the server afterwards", async ({ page }) => {
  await registerAndLogin(page, `offline-filters-${Date.now()}-${test.info().workerIndex}`);
  const today = new Date().toISOString().slice(0, 10);
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string; isInbox: boolean }[];
  const inbox = projects.find((project) => project.isInbox)!;
  for (const [content, priority] of [["Pay the gas bill", 1], ["Water the plants", 4], ["Call the dentist", 2]] as const) {
    const response = await page.request.post("/api/tasks", { data: { projectId: inbox.id, content, priority, dueDate: today } });
    expect(response.ok()).toBe(true);
  }
  // Pinned, so the sidebar has a row to edit it from.
  const created = await page.request.post("/api/filters", { data: { name: "Urgent", query: "p1" } });
  const urgent = (await created.json()) as ServerFilter;
  expect((await page.request.patch(`/api/filters/${urgent.id}`, { data: { isFavorite: true } })).ok()).toBe(true);

  // Each page is reloaded under the worker, so it is cached. A page opened for the first time offline isn't.
  for (const path of [`/filters/${urgent.id}`, "/filters-labels"]) {
    await page.goto(path);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
  }
  await waitForSync(page);

  await page.context().setOffline(true);
  const note = page.getByRole("button", { name: /^You're offline/ });
  await expect(note).toBeVisible();

  await page.goto(`/filters/${urgent.id}`);
  await expect(task(page, "Pay the gas bill")).toBeVisible();
  await expect(task(page, "Call the dentist")).toHaveCount(0);

  await page.getByRole("button", { name: "More options for Urgent", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit query" }).click();
  await page.getByRole("textbox", { name: "Query for Urgent" }).fill("p1 | p2");
  await page.keyboard.press("Enter");
  await expect(task(page, "Call the dentist")).toBeVisible();
  await expect(page.getByText("p1 | p2")).toBeVisible();
  await expect(task(page, "Water the plants")).toHaveCount(0);

  await page.getByRole("link", { name: "Organize" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Filter name").fill("Quiet");
  await page.getByLabel("Filter query").fill("p4");
  await page.getByRole("button", { name: "Create filter" }).click();
  await expect(page.getByRole("link", { name: "Quiet" })).toBeVisible();
  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(note).toBeVisible();
  await expect(page.getByRole("link", { name: "Quiet" })).toBeVisible();
  await page.goto(`/filters/${urgent.id}`);
  await expect(task(page, "Call the dentist")).toBeVisible();

  await page.context().setOffline(false);
  await expect(note).toBeHidden();
  await expect.poll(async () => {
    const filters = (await (await page.request.get("/api/v1/filters")).json()) as ServerFilter[];
    return filters.map((filter) => [filter.name, filter.query]).sort();
  }, { timeout: 30_000 }).toEqual([["Quiet", "p4"], ["Urgent", "p1 | p2"]]);

  // The new filter opens from the local copy, under the id the server gave it.
  await page.getByRole("link", { name: "Organize" }).click();
  await page.getByRole("link", { name: "Quiet" }).click();
  await expect(page.getByRole("heading", { name: "Quiet", level: 1 })).toBeVisible();
  await expect(task(page, "Water the plants")).toBeVisible();
  await expect(task(page, "Pay the gas bill")).toHaveCount(0);
});
