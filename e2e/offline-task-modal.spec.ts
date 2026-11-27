import { expect, test, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin, waitForSync } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 }, timezoneId: "UTC" });

type ServerTask = { id: string; content: string; description: string | null; parentId: string | null; isCompleted: boolean; deletedAt: string | null };

const row = (page: Page, content: string) => page.getByRole("group", { name: `Task: ${content}`, exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

async function serverTasks(page: Page) {
  const response = await page.request.get("/api/v1/tasks?limit=100");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: ServerTask[] }).items.filter((task) => task.deletedAt === null);
}

const serverNotes = async (page: Page, kind: "comments" | "reminders", taskId: string) => {
  const response = await page.request.get(`/api/v1/${kind}?taskId=${taskId}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { content?: string; remindAt?: string }[];
};

const localIdOf = (page: Page, content: string) =>
  page.evaluate(async (content) => {
    const [name] = (await indexedDB.databases()).map((db) => db.name).filter((name) => name?.startsWith("conatus-"));
    return new Promise<string | undefined>((resolve, reject) => {
      const open = indexedDB.open(name!);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const all = open.result.transaction("tasks").objectStore("tasks").getAll();
        all.onsuccess = () => {
          open.result.close();
          resolve((all.result as { id: string; content: string }[]).find((task) => task.content === content)?.id);
        };
      };
    });
  }, content);

async function openTask(page: Page, content: string) {
  await row(page, content).getByText(content, { exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator("#task-dialog-title")).toHaveText(content);
}

async function editTask(page: Page, content: string, suffix: string) {
  await openTask(page, content);
  const modal = dialog(page);
  await modal.getByText("Description", { exact: true }).click();
  await modal.getByRole("textbox").first().fill(`About ${suffix}`);
  await modal.getByRole("textbox").first().blur();
  await expect(modal.getByText(`About ${suffix}`)).toBeVisible();

  await modal.getByRole("button", { name: "New task" }).click();
  await modal.getByRole("textbox", { name: "Task name" }).fill(`Step one ${suffix}`);
  await page.keyboard.press("Enter");
  await expect(modal.getByText(`Step one ${suffix}`)).toBeVisible();
  await modal.getByRole("textbox", { name: "Task name" }).fill(`Step two ${suffix}`);
  await page.keyboard.press("Enter");
  await expect(modal.getByText(`Step two ${suffix}`)).toBeVisible();
  await modal.getByRole("button", { name: "Mark complete" }).nth(1).click();
  await expect(modal.getByText("1/2")).toBeVisible();

  await modal.getByRole("textbox", { name: "Comment" }).fill(`Note ${suffix}`);
  await page.keyboard.press("Enter");
  await expect(modal.getByText(`Note ${suffix}`)).toBeVisible();

  await modal.getByRole("button", { name: "Add reminder" }).click();
  await modal.getByLabel("Reminder date").fill("2031-03-04");
  await modal.getByLabel("Reminder time").fill("09:30");
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(modal.getByText(/2031/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
}

async function checkTask(page: Page, content: string, suffix: string) {
  await openTask(page, content);
  const modal = dialog(page);
  await expect(modal.getByText(`About ${suffix}`)).toBeVisible();
  await expect(modal.getByText(`Step one ${suffix}`)).toBeVisible();
  await expect(modal.getByText(`Step two ${suffix}`)).toBeVisible();
  await expect(modal.getByText("1/2")).toBeVisible();
  await expect(modal.getByText(`Note ${suffix}`)).toBeVisible();
  await expect(modal.getByText(/2031/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
}

test("task details work offline, for tasks made offline and online, and reach the server", async ({ page }) => {
  await registerAndLogin(page, `offline-modal-${Date.now()}-${test.info().workerIndex}`);
  const created = await page.request.post("/api/projects", { data: { name: "Details", color: "blue" } });
  expect(created.ok()).toBe(true);
  const project = (await created.json()) as { id: string };
  expect((await page.request.post("/api/tasks", { data: { projectId: project.id, content: "Online task" } })).ok()).toBe(true);

  await page.goto(`/projects/${project.id}`);
  await expect(row(page, "Online task")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(row(page, "Online task")).toBeVisible();
  await waitForSync(page);

  await page.context().setOffline(true);
  const note = page.getByRole("button", { name: /^You're offline/ });
  await expect(note).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("Offline task");
  await page.keyboard.press("Enter");
  await expect(row(page, "Offline task")).toBeVisible();

  await editTask(page, "Offline task", "local");
  await editTask(page, "Online task", "synced");
  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(10);

  await page.reload();
  await expect(note).toBeVisible();
  await checkTask(page, "Offline task", "local");
  await checkTask(page, "Online task", "synced");

  const localId = await localIdOf(page, "Offline task");
  expect(localId).toMatch(/^local:/);

  await page.context().setOffline(false);
  await expect(note).toBeHidden();
  await expect.poll(async () => {
    const tasks = await serverTasks(page);
    const local = tasks.find((task) => task.content === "Offline task");
    const online = tasks.find((task) => task.content === "Online task");
    if (!local || !online) return null;
    const result = [];
    for (const [task, suffix] of [[local, "local"], [online, "synced"]] as const) {
      const steps = tasks.filter((child) => child.parentId === task.id).sort((a, b) => a.content.localeCompare(b.content));
      result.push({
        description: task.description,
        steps: steps.map((step) => [step.content, step.isCompleted]),
        comments: (await serverNotes(page, "comments", task.id)).map((comment) => comment.content),
        reminders: (await serverNotes(page, "reminders", task.id)).map((reminder) => reminder.remindAt),
        suffix,
      });
    }
    return result;
  }, { timeout: 30_000 }).toEqual(["local", "synced"].map((suffix) => ({
    description: `About ${suffix}`,
    steps: [[`Step one ${suffix}`, true], [`Step two ${suffix}`, false]],
    comments: [`Note ${suffix}`],
    reminders: ["2031-03-04T09:30:00.000Z"],
    suffix,
  })));

  const serverId = (await serverTasks(page)).find((task) => task.content === "Offline task")!.id;

  // The address from before the sync keeps working after a reload, since the alias is stored.
  await page.goto(`/projects/${project.id}?task=${encodeURIComponent(localId!)}`);
  await expect(dialog(page).locator("#task-dialog-title")).toHaveText("Offline task");
  await expect(page).toHaveURL(new RegExp(`task=${serverId}`));
});
