import { expect, test, type Page } from "@playwright/test";

import { registerAndLogin, waitForSync } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 }, timezoneId: "UTC" });

const projectRow = (page: Page, name: string) => page.locator(`[data-project-name="${name}"]`);
const task = (page: Page, content: string) => page.getByRole("group", { name: `Task: ${content}`, exact: true });

// A new account has opened nothing but its first page, so what is offline-capable afterwards is what the app cached by itself.
async function startOnThisDevice(page: Page, name: string) {
  await registerAndLogin(page, `${name}-${Date.now()}-${test.info().workerIndex}`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
}

async function untilWarmed(page: Page) {
  await waitForSync(page);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("conatus-pages")).keys()).length), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
}

async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: /^You're offline/ })).toBeVisible();
}

async function project(page: Page, name: string, tasks: string[]) {
  const created = (await (await page.request.post("/api/projects", { data: { name } })).json()) as { id: string };
  for (const content of tasks) expect((await page.request.post("/api/tasks", { data: { projectId: created.id, content } })).ok()).toBe(true);
  return created.id;
}

test("a project this device never opened opens offline, from the sidebar and by address", async ({ page }) => {
  await startOnThisDevice(page, "shell-project");
  const first = await project(page, "First", ["In first"]);
  const second = await project(page, "Second", ["In second"]);
  await page.reload();
  await expect(projectRow(page, "Second")).toBeVisible();
  await untilWarmed(page);

  await goOffline(page);
  await projectRow(page, "First").click();
  await expect(page).toHaveURL(new RegExp(`/projects/${first}$`));
  await expect(task(page, "In first")).toBeVisible();

  await page.goto(`/projects/${second}`);
  await expect(page).toHaveURL(new RegExp(`/projects/${second}$`));
  await expect(page.getByRole("main").getByRole("button", { name: "Second", exact: true })).toBeVisible();
  await expect(task(page, "In second")).toBeVisible();
  await expect(task(page, "In first")).toHaveCount(0);
  // Hydrating a page cached for another project leaves the address alone.
  expect(page.url()).toMatch(new RegExp(`/projects/${second}$`));
});

test("a project made offline opens from the sidebar and after a reload", async ({ page }) => {
  await startOnThisDevice(page, "shell-local");
  await untilWarmed(page);

  await goOffline(page);
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByPlaceholder("Project name").fill("Offline made");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await projectRow(page, "Offline made").click();
  await expect(page).toHaveURL(/\/projects\/local(:|%3A)/);
  await expect(page.getByRole("main").getByRole("button", { name: "Offline made", exact: true })).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("First thing");
  await page.keyboard.press("Enter");
  await expect(task(page, "First thing")).toBeVisible();

  const url = page.url();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("main").getByRole("button", { name: "Offline made", exact: true })).toBeVisible();
  await expect(task(page, "First thing")).toBeVisible();
});

test("a filter made offline opens offline", async ({ page }) => {
  await startOnThisDevice(page, "shell-filter");
  const inbox = ((await (await page.request.get("/api/projects")).json()) as { id: string; isInbox: boolean }[]).find((item) => item.isInbox)!;
  const today = new Date().toISOString().slice(0, 10);
  expect((await page.request.post("/api/tasks", { data: { projectId: inbox.id, content: "Quiet one", priority: 4, dueDate: today } })).ok()).toBe(true);
  await page.reload();
  await untilWarmed(page);

  await goOffline(page);
  await page.getByRole("link", { name: "Organize" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Filter name").fill("Quiet");
  await page.getByLabel("Filter query").fill("p4");
  await page.getByRole("button", { name: "Create filter" }).click();
  await page.getByRole("link", { name: "Quiet" }).click();
  await expect(page).toHaveURL(/\/filters\/local(:|%3A)/);
  await expect(page.getByRole("heading", { name: "Quiet", exact: true, level: 1 })).toBeVisible();
  await expect(task(page, "Quiet one")).toBeVisible();

  const url = page.url();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Quiet", exact: true, level: 1 })).toBeVisible();
  await expect(task(page, "Quiet one")).toBeVisible();
});

test("a top-level page this device never opened opens offline", async ({ page }) => {
  await startOnThisDevice(page, "shell-trash");
  const id = await project(page, "Gone", ["Binned"]);
  expect((await page.request.delete(`/api/projects/${id}`)).ok()).toBe(true);
  await page.reload();
  await untilWarmed(page);

  await goOffline(page);
  await page.goto("/trash");
  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
  await page.goto("/search?q=Binned");
  await expect(page).toHaveURL(/\/search\?q=Binned$/);
  await expect(page.getByText("Results for")).toBeVisible();
});

test("the open task follows ?task= in the address", async ({ page }) => {
  await startOnThisDevice(page, "shell-task");
  const id = await project(page, "Modal", ["Alpha", "Beta"]);
  const tasks = (await (await page.request.get("/api/v1/tasks?limit=100")).json()) as { items: { id: string; content: string }[] };
  const beta = tasks.items.find((item) => item.content === "Beta")!;
  await page.goto(`/projects/${id}`);
  await expect(task(page, "Alpha")).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(0);

  await page.evaluate((url) => history.pushState(null, "", url), `/projects/${id}?task=${beta.id}`);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Beta");

  await page.evaluate((path) => history.replaceState(null, "", path), `/projects/${id}`);
  await expect(dialog).toHaveCount(0);

  await task(page, "Alpha").getByText("Alpha").click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/[?&]task=/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
});
