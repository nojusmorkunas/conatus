import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

type Task = { id: string; priority: number };

async function create(page: Page, resource: string, data: object) {
  const response = await page.request.post(`/api/${resource}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

function row(page: Page, content: string) {
  return page.getByRole("group", { name: `Task: ${content}`, exact: true });
}

async function setup(page: Page) {
  await registerAndLogin(page, `keys-${Date.now()}-${test.info().workerIndex}`);
  const project = await create(page, "projects", { name: "Keyboard", color: "blue" });
  const add = (content: string) => create(page, "tasks", { projectId: project.id, content });
  const alpha = await add("Alpha");
  const beta = await add("Beta");
  const gamma = await add("Gamma");
  await page.goto(`/projects/${project.id}`);
  await expect(row(page, "Gamma")).toBeVisible();
  return { project, alpha, beta, gamma };
}

// A key pressed before React hydrates goes nowhere, so the first one after a
// page load repeats until it lands.
async function untilItLands(action: () => Promise<void>, check: () => Promise<void>) {
  await expect(async () => {
    await action();
    await check();
  }).toPass();
}

async function priority(page: Page, projectId: string, id: string) {
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  const tasks: Task[] = await response.json();
  return tasks.find((task) => task.id === id)?.priority;
}

test("Todoist's keys move focus and act on the focused task", async ({ page }) => {
  const f = await setup(page);

  await untilItLands(
    () => page.keyboard.press("j"),
    () => expect(row(page, "Alpha")).toBeFocused({ timeout: 500 }),
  );
  await page.keyboard.press("j");
  await expect(row(page, "Beta")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(row(page, "Alpha")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Beta")).toBeFocused();

  await page.keyboard.press("1");
  await expect.poll(() => priority(page, f.project.id, f.beta.id)).toBe(1);

  await page.keyboard.press("e");
  await expect(row(page, "Gamma")).toBeFocused();
  await expect(page.getByText('Completed "Beta"')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row(page, "Beta")).toBeVisible();

  await row(page, "Gamma").focus();
  await page.keyboard.press("x");
  await expect(row(page, "Gamma")).toHaveClass(/is-selected/);
  await page.keyboard.press("Delete");
  await expect(row(page, "Gamma")).toHaveCount(0);
});

test("Shift-click selects a range", async ({ page }) => {
  await setup(page);
  await untilItLands(
    () => row(page, "Alpha").click({ modifiers: ["ControlOrMeta"] }),
    () => expect(row(page, "Alpha")).toHaveClass(/is-selected/, { timeout: 500 }),
  );
  await row(page, "Gamma").click({ modifiers: ["Shift"] });
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    await expect(row(page, name)).toHaveClass(/is-selected/);
  }
});

test("global keys open Quick Add, help and other views", async ({ page }) => {
  await setup(page);

  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await untilItLands(
    () => page.keyboard.press("?"),
    () => expect(help).toBeVisible({ timeout: 500 }),
  );
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);

  // A focused task must not read the t of g t as "set date".
  await page.keyboard.press("j");
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/today/);

  // Settings has no list of its own, and q still opens Quick Add there.
  await page.goto("/settings");
  const quickAdd = page.getByRole("dialog", { name: "Add task" });
  await untilItLands(
    () => page.keyboard.press("q"),
    () => expect(quickAdd).toBeVisible({ timeout: 500 }),
  );
  await page.keyboard.press("Escape");
  await expect(quickAdd).toHaveCount(0);
});
