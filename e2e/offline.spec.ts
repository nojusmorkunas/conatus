import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

async function openInboxComposer(page: Page, name: string) {
  await registerAndLogin(page, `e2e-${Date.now()}-${name}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/projects\//);
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  const composer = page.getByRole("form", { name: "New task" });
  await expect(composer.getByRole("button", { name: "Project and section" })).toContainText("Inbox");
  return { input: composer.getByRole("textbox", { name: "Task name", exact: true }), projectId };
}

async function tasksIn(page: Page, projectId: string) {
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ content: string }[]>;
}

test("a task added offline stays on the device, and syncs exactly once", async ({ page }) => {
  const { input, projectId } = await openInboxComposer(page, "queue");
  const region = page.getByRole("region", { name: "Unsynced tasks" });
  const syncNow = region.getByRole("button", { name: "Sync now" });

  await page.context().setOffline(true);
  await input.fill("Buy milk offline");
  await input.press("Enter");
  await expect(region).toContainText("Buy milk offline");

  // One handler for the whole test: background syncs (mount, online, interval) can fire at any point, so the mode decides what each create gets.
  let mode: "abort" | "lose-response" | "pass" = "abort";
  let lost = 0;
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() !== "POST" || mode === "pass") return route.continue();
    if (mode === "lose-response") {
      // The server stores the task, but the page never sees the reply.
      await route.fetch();
      lost++;
    }
    return route.abort();
  });
  // Every create fails while the page reloads, so the task must come back from storage.
  await page.context().setOffline(false);
  await page.reload();
  await expect(region).toContainText("Buy milk offline");

  mode = "lose-response";
  await expect(async () => {
    if (await region.count()) await syncNow.click({ timeout: 1000 });
    expect(lost).toBeGreaterThan(0);
  }).toPass();
  await expect(region).toContainText("Buy milk offline");

  mode = "pass";
  await expect(async () => {
    if (await region.count()) await syncNow.click({ timeout: 1000 });
    await expect(region).toHaveCount(0, { timeout: 2000 });
  }).toPass();
  expect((await tasksIn(page, projectId)).filter((task) => task.content === "Buy milk offline")).toHaveLength(1);
  await expect(page.getByRole("main").getByText("Buy milk offline", { exact: true })).toBeVisible();
});

test.describe("offline shell", () => {
  // The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
  test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
  test.use({ serviceWorkers: "allow" });

  test("reloads the inbox from cache and syncs the task once back online", async ({ page }) => {
    const { input, projectId } = await openInboxComposer(page, "sw");
    const region = page.getByRole("region", { name: "Unsynced tasks" });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();

    await page.context().setOffline(true);
    await page.getByRole("main").getByRole("button", { name: "New task" }).click();
    await input.fill("Buy bread offline");
    await input.press("Enter");
    await expect(region).toContainText("Buy bread offline");

    await page.reload();
    await expect(region).toContainText("Buy bread offline");

    await page.context().setOffline(false);
    await expect(region).toHaveCount(0);
    expect((await tasksIn(page, projectId)).filter((task) => task.content === "Buy bread offline")).toHaveLength(1);
  });
});
