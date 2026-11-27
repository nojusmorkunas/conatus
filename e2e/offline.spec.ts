import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin, waitForSync } from "./helpers";

async function openInbox(page: Page, name: string) {
  await registerAndLogin(page, `e2e-${Date.now()}-${name}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/projects\//);
}

test("shows an offline pill at the bottom while the browser is offline", async ({ page }) => {
  await openInbox(page, "note");
  const pill = page.getByRole("button", { name: /^You're offline/ });

  await page.context().setOffline(true);
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(page.viewportSize()!.height - 80);
  await page.context().setOffline(false);
  await expect(pill).toBeHidden();
});

test("the offline pill explains itself on hover and on click", async ({ page }) => {
  await openInbox(page, "popover");
  const pill = page.getByRole("button", { name: /^You're offline/ });
  const explanation = page.getByText("Working offline", { exact: true });

  await page.context().setOffline(true);
  await pill.hover();
  await expect(explanation).toBeVisible();
  await expect(page.getByText("Attachments, sharing, assigning, imports and settings need a connection.")).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(explanation).toBeHidden();

  await pill.click();
  await expect(explanation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(explanation).toBeHidden();
  await page.context().setOffline(false);
});

test("back online reports the change that synced", async ({ page }) => {
  await openInbox(page, "back");
  await waitForSync(page);

  await page.context().setOffline(true);
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("Written offline");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Task: Written offline", exact: true })).toBeVisible();
  await page.context().setOffline(false);

  await expect(page.locator('[data-slot="sync-status-pill"]', { hasText: "Back online · 1 change synced" })).toBeVisible({ timeout: 30_000 });
});

test("the offline pill folds into its icon after a minute and opens on hover", async ({ page }) => {
  await openInbox(page, "shrink");
  await page.clock.install();
  const pill = page.getByRole("button", { name: /^You're offline/ });

  await page.context().setOffline(true);
  await expect(pill).not.toHaveAttribute("data-collapsed");
  await page.clock.fastForward(60_000);
  await expect(pill).toHaveAttribute("data-collapsed");

  await pill.hover();
  await expect(pill).not.toHaveAttribute("data-collapsed");
  await page.mouse.move(0, 0);
  await expect(pill).toHaveAttribute("data-collapsed");
  await page.context().setOffline(false);
});

test.describe("offline shell", () => {
  // The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
  test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
  test.use({ serviceWorkers: "allow" });

  test("reloads the inbox from cache while offline", async ({ page }) => {
    await openInbox(page, "sw");
    // Offline there is nothing to show until the local copy has been filled once.
    await waitForSync(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();

    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("main").getByRole("button", { name: "New task" })).toBeVisible();
    const note = page.getByRole("button", { name: /^You're offline/ });
    await expect(note).toBeVisible();

    await page.context().setOffline(false);
    await expect(note).toBeHidden();
  });
});
