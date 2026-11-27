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

// Waits for a sync that finished after [after] (epoch ms) and was stored. With no [after] that is the first
// sync, which is what makes the local copy usable offline.
export async function waitForSync(page: Page, after = 0) {
  await expect.poll(() => page.evaluate(async (after) => {
    const [name] = (await indexedDB.databases()).map((db) => db.name).filter((name) => name?.startsWith("conatus-"));
    if (!name) return false;
    return new Promise<boolean>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const get = open.result.transaction("meta").objectStore("meta").get("lastSyncAt");
        get.onsuccess = () => {
          open.result.close();
          resolve(typeof get.result === "number" && get.result > after);
        };
      };
    });
  }, after), { timeout: 15_000 }).toBe(true);
}

// The local copy writes to IndexedDB a moment after the screen changes, and a reload must not beat it.
export const queuedChanges = (page: Page) =>
  page.evaluate(async () => {
    const [name] = (await indexedDB.databases()).map((db) => db.name).filter((name) => name?.startsWith("conatus-"));
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open(name!);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const count = open.result.transaction("changes").objectStore("changes").count();
        count.onsuccess = () => {
          open.result.close();
          resolve(count.result);
        };
      };
    });
  });
