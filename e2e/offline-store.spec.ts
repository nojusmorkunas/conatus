import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

const databases = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name).filter((name) => name?.startsWith("conatus-")));

const storedTasks = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction("tasks").objectStore("tasks").count();
          count.onsuccess = () => {
            open.result.close();
            resolve(count.result);
          };
        };
      }),
    name,
  );

test("a page load opens the local store, syncs it, and signing out deletes it", async ({ page }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-store-${Math.random().toString(36).slice(2, 6)}`);
  const projects = await (await page.request.get("/api/v1/projects")).json();
  const inbox = projects.find((project: { isInbox: boolean }) => project.isInbox);
  await page.request.post("/api/v1/tasks", { data: { projectId: inbox.id, content: "Stored locally" } });

  await page.goto("/today");
  await expect.poll(async () => (await databases(page)).length).toBe(1);
  const [name] = await databases(page);
  await expect.poll(() => storedTasks(page, name!)).toBe(1);

  await page.goto("/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await databases(page)).toEqual([]);
});
