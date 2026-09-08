import { expect, test, type Page } from "@playwright/test";

import { registerAndLogin } from "./helpers";

const taskContent = "Water the plants";

async function inboxId(page: Page): Promise<string> {
  const response = await page.request.get("/api/projects");
  expect(response.ok()).toBeTruthy();
  const projects: { id: string; isInbox: boolean }[] = await response.json();
  const inbox = projects.find((project) => project.isInbox);
  expect(inbox, "registration creates an inbox").toBeTruthy();
  return inbox!.id;
}

async function fixtureTask(page: Page, projectId: string) {
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  expect(response.ok()).toBeTruthy();
  const tasks: {
    content: string;
    dueDate: string | null;
    recurrence: string | null;
  }[] = await response.json();
  return tasks.find((task) => task.content === taskContent)!;
}

// The picker writes through the same PATCH the rest of the detail panel uses,
// so assert on stored state rather than the trigger's own label.
async function ruleOf(page: Page, projectId: string) {
  return (await fixtureTask(page, projectId)).recurrence;
}

function taskDialog(page: Page) {
  return page.getByRole("dialog").filter({ hasText: taskContent });
}

// The detail panel stays open across these tests; each one reopens the menu
// from its Repeat button rather than depending on the menu's own state.
async function openMenu(page: Page) {
  await taskDialog(page).getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("setting a repeat from the UI", () => {
  let page: Page;
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await registerAndLogin(page, `e2e-${Date.now()}-rrule`);
    projectId = await inboxId(page);
    await page.goto(`/projects/${projectId}`);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("the composer creates a repeating task with a first due date", async () => {
    await page.getByRole("main").getByRole("button", { name: "New task" }).click();
    await page
      .getByPlaceholder("Task name (try: pay rent tomorrow p2 #Home @bills)")
      .fill(taskContent);
    await page.getByRole("main").getByRole("button", { name: "Repeat", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Every 2 weeks" }).click();
    await page.getByRole("main").getByRole("button", { name: "Add task" }).click();

    await expect(page.locator(`[data-task-content="${taskContent}"]`)).toBeVisible();
    const task = await fixtureTask(page, projectId);
    expect(task.recurrence).toBe("every 2 weeks");
    // An interval rule needs an anchor to count from, so it starts today.
    expect(task.dueDate).toBe(new Date().toISOString().slice(0, 10));
  });

  test("a preset in the detail panel changes the rule", async () => {
    await page.locator(`[data-task-content="${taskContent}"]`).click();
    await expect(taskDialog(page)).toBeVisible();

    await openMenu(page);
    await page.getByRole("menuitemcheckbox", { name: "Monthly" }).click();
    await expect.poll(() => ruleOf(page, projectId)).toBe("every month");
  });

  test("the custom dialog builds an interval the presets do not cover", async () => {
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Custom…" }).click();

    const custom = page.getByRole("dialog", { name: "Custom repeat" });
    await custom.getByLabel("Repeat interval").fill("3");
    await custom.getByLabel("Repeat unit").click();
    await page.getByRole("option", { name: "years" }).click();
    await custom.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => ruleOf(page, projectId)).toBe("every 3 years");
  });

  test("the custom dialog opens on the rule the task already has", async () => {
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Custom…" }).click();

    const custom = page.getByRole("dialog", { name: "Custom repeat" });
    await expect(custom.getByLabel("Repeat interval")).toHaveValue("3");
    await expect(custom.getByLabel("Repeat unit")).toContainText("years");

    // Weekly repeats of one or two are the only ones a weekday fits, so the
    // day picker appears with them and the rule takes the shorter form.
    await custom.getByLabel("Repeat interval").fill("2");
    await custom.getByLabel("Repeat unit").click();
    await page.getByRole("option", { name: "weeks" }).click();
    await custom.getByLabel("Repeat weekday").click();
    await page.getByRole("option", { name: "Friday" }).click();
    await custom.getByRole("checkbox", { name: "Count from the completion date" }).check();
    await custom.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => ruleOf(page, projectId)).toBe("every! other friday");
  });

  test("clearing the repeat keeps the due date", async () => {
    await openMenu(page);
    await page.getByRole("menuitemcheckbox", { name: "No repeat" }).click();

    await expect.poll(() => ruleOf(page, projectId)).toBeNull();
    expect((await fixtureTask(page, projectId)).dueDate).not.toBeNull();
  });
});
