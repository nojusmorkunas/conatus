import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

async function openInbox(page: Page, name: string) {
  await registerAndLogin(page, `e2e-${Date.now()}-${name}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/projects\//);
}

test("shows an offline note while the browser is offline", async ({ page }) => {
  await openInbox(page, "note");
  const note = page.getByRole("status").filter({ hasText: "You are currently offline." });

  await page.context().setOffline(true);
  await expect(note).toBeVisible();
  await page.context().setOffline(false);
  await expect(note).toBeHidden();
});

test.describe("offline shell", () => {
  // The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
  test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
  test.use({ serviceWorkers: "allow" });

  test("reloads the inbox from cache while offline", async ({ page }) => {
    await openInbox(page, "sw");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();

    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("main").getByRole("button", { name: "New task" })).toBeVisible();
    const note = page.getByRole("status").filter({ hasText: "You are currently offline." });
    await expect(note).toBeVisible();

    await page.context().setOffline(false);
    await expect(note).toBeHidden();
  });
});
