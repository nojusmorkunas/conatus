import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const testPassword = "correct-horse-battery-staple";

export async function registerVerifyAndLogin(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  // The app deliberately rate-limits by proxy-provided client IP. Give each
  // disposable browser user a stable synthetic address so parallel tests and
  // local reruns do not consume one another's security budget.
  const octets = [...email].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.18.${(octets >>> 8) & 255}.${octets & 255}`,
  });
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?verificationSent=true/);

  let messageId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(
      `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (!response.ok()) return false;
    const body = await response.json() as { messages?: Array<{ ID: string }> };
    messageId = body.messages?.[0]?.ID;
    return Boolean(messageId);
  }).toBe(true);
  const message = await request.get(`http://localhost:8025/api/v1/message/${messageId}`);
  const { Text: text } = await message.json() as { Text: string };
  const verificationUrl = text.match(/https?:\/\/[^\s]+\/verify-email\?token=[^\s]+/)?.[0];
  expect(verificationUrl).toBeTruthy();
  await page.goto(verificationUrl!);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Start without importing" }).click();
  await expect(page).toHaveURL(/\/today/);
}
