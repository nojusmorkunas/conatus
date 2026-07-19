import { expect, type Page } from "@playwright/test";

export const testPassword = "correct-horse-battery-staple";

export async function registerAndLogin(page: Page, username: string) {
  // The app deliberately rate-limits by proxy-provided client IP. Give each
  // disposable browser user a stable synthetic address so parallel tests and
  // local reruns do not consume one another's security budget.
  const octets = [...username].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.18.${(octets >>> 8) & 255}.${octets & 255}`,
  });
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Start without importing" }).click();
  await expect(page).toHaveURL(/\/today/);
}
