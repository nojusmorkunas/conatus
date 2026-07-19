import { test, expect } from "@playwright/test";
import { registerVerifyAndLogin } from "./helpers";

function throwawayUser(suffix: string) {
  return {
    email: `e2e-${Date.now()}-${suffix}@test.local`,
    password: "correct-horse-battery-staple",
  };
}

test("registration, verification, and onboarding land in the authenticated app shell", async ({ page, request }) => {
  const user = throwawayUser("auth");
  await registerVerifyAndLogin(page, request, user.email);
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Focus" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();

  // Log out via the settings page.
  await page.goto("/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});
