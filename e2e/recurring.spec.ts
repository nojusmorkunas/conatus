import { expect, test, type Page } from "@playwright/test";

// Runs against the demo seed rather than a disposable user: an overdue
// recurring task is a state you would have to wait days to reach naturally,
// so the seed is the only place one reliably exists.
const username = process.env.SEED_USERNAME ?? "admin";
const password = process.env.SEED_PASSWORD ?? "admin12345";

// "every 3 days", seeded four days overdue in Personal.
const taskContent = "Water the plants";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/today/);
}

function taskRow(page: Page) {
  return page.locator(`[data-task-content="${taskContent}"]`);
}

async function openPersonal(page: Page): Promise<string> {
  const response = await page.request.get("/api/projects");
  expect(response.ok()).toBeTruthy();
  const projects: { id: string; name: string }[] = await response.json();
  const personal = projects.find((project) => project.name === "Personal");
  expect(personal, "the demo seed must have run").toBeTruthy();

  await page.goto(`/projects/${personal!.id}`);
  await expect(taskRow(page)).toBeVisible();
  return personal!.id;
}

async function seededTask(page: Page, projectId: string) {
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  expect(response.ok()).toBeTruthy();
  const tasks: { id: string; content: string; dueDate: string }[] = await response.json();
  return tasks.find((task) => task.content === taskContent)!;
}

async function dueDateOf(page: Page, projectId: string): Promise<string> {
  return (await seededTask(page, projectId)).dueDate;
}

// Each test completes the task, which advances it out of the overdue state the
// next test needs. Put it back rather than depending on execution order.
async function resetToOverdue(page: Page, projectId: string) {
  const task = await seededTask(page, projectId);
  const overdue = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  const response = await page.request.patch(`/api/tasks/${task.id}`, {
    data: { dueDate: overdue },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await expect(taskRow(page)).toBeVisible();
}

// Clicks complete and returns how long the server took to hear about it.
// The elapsed time is the assertion that matters: the old code held the write
// in a five-second undo timer, so anything that merely waits for the response
// sleeps through the bug and passes either way.
async function completeAndMeasure(page: Page): Promise<number> {
  const started = Date.now();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/api\/tasks\//.test(response.url()),
    ),
    taskRow(page).getByRole("button", { name: "Mark complete" }).click(),
  ]);
  return Date.now() - started;
}

const UNDO_WINDOW_MS = 5_000;

// Sign in once for the whole file. Login allows five attempts per username
// per five minutes, and every test here uses the same seeded account, so a
// login per test locks the account out partway through the run.
test.describe.configure({ mode: "serial" });

test.describe("completing an overdue recurring task", () => {
  let page: Page;
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
    projectId = await openPersonal(page);
  });

  test.afterAll(async () => {
    await page.close();
  });
  test("advances the date without the row leaving the list", async () => {
    await resetToOverdue(page, projectId);
    const before = await dueDateOf(page, projectId);

    await taskRow(page).getByRole("button", { name: "Mark complete" }).click();

    // Deliberately sample partway into what used to be the undo window. The
    // old code hid the row for its whole duration and then put it back, so
    // asserting only at the end cannot tell the two behaviours apart.
    await page.waitForTimeout(UNDO_WINDOW_MS / 5);
    // Short timeout on purpose: the default one outlasts the undo window, so
    // it would poll until the old code's deferred refresh restored the row.
    await expect(taskRow(page)).toBeVisible({ timeout: UNDO_WINDOW_MS / 5 });

    await expect.poll(() => dueDateOf(page, projectId)).not.toBe(before);
    expect(await dueDateOf(page, projectId) > before).toBeTruthy();

    // The row survives the click, so the completion animation has to be wound
    // back too. Otherwise the checkbox stays ticked on a task that is open.
    await expect(
      taskRow(page).getByRole("button", { name: "Mark complete" }),
    ).toBeVisible();
  });

  test("survives a reload taken straight after the click", async () => {
    await resetToOverdue(page, projectId);
    const before = await dueDateOf(page, projectId);

    const elapsed = await completeAndMeasure(page);

    // The write has to be sent now, not parked in a timer. Without this the
    // reload below simply waits out the window and passes against the bug.
    expect(elapsed).toBeLessThan(UNDO_WINDOW_MS / 2);

    await page.reload();
    await expect(taskRow(page)).toBeVisible();
    expect(await dueDateOf(page, projectId)).not.toBe(before);
  });

  test("undo puts the original due date back", async () => {
    await resetToOverdue(page, projectId);
    const before = await dueDateOf(page, projectId);

    await completeAndMeasure(page);

    // Still inside the toast's lifetime, because the write no longer consumes
    // it. Undo is now an inverse request rather than a cancelled timer.
    await page.getByRole("button", { name: "Undo" }).click({ timeout: UNDO_WINDOW_MS });

    await expect(taskRow(page)).toBeVisible();
    await expect.poll(() => dueDateOf(page, projectId)).toBe(before);
  });
});
