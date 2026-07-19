import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./helpers";

function throwawayUser(suffix: string) {
  return {
    username: `e2e-${Date.now()}-${suffix}`,
    password: "correct-horse-battery-staple",
  };
}

test("registration and onboarding land in the authenticated app shell", async ({ page }) => {
  const user = throwawayUser("auth");
  await registerAndLogin(page, user.username);
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Focus" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();

  // Log out via the settings page.
  await page.goto("/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});
