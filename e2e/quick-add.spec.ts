import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

async function openComposer(page: Page) {
  await registerAndLogin(page, `e2e-${Date.now()}-qa-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/projects\//);
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  const composer = page.getByRole("form", { name: "New task" });
  await expect(composer.getByRole("button", { name: "Project and section" })).toContainText("Inbox");
  return { composer, projectId, input: composer.getByRole("textbox", { name: "Task name", exact: true }) };
}

async function openAction(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name: "Add task details" }).click();
  await page.getByRole("menuitem", { name, exact: typeof name === "string" }).click();
}

async function tasksIn(page: Page, projectId: string) {
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("recognizes details while typing and saves the same preview on Enter", async ({ page }) => {
  const { composer, input } = await openComposer(page);
  const project = await (await page.request.post("/api/projects", { data: { name: "Home office" } })).json();
  const label = await (await page.request.post("/api/labels", { data: { name: "deep work" } })).json();
  // Reload to receive the newly-created label and destination in the composer.
  await page.reload();
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await expect(composer.getByRole("button", { name: "Project and section" })).toContainText("Inbox");
  let creates = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/tasks") creates++; });

  await input.fill("Pay rent tomorro");
  await expect(composer.getByRole("button", { name: "Date", exact: true })).toHaveText("Date");
  await input.pressSequentially("w");
  await expect(composer.getByRole("button", { name: "Date", exact: true })).toContainText("Tomorrow");
  await input.fill("Pay rent tomorrow at 9am p2 #Home office @deep work {friday} for 30m");
  await expect(composer.getByRole("button", { name: "Project and section" })).toContainText("Home office");
  await expect(composer.getByRole("button", { name: "Priority", exact: true })).toHaveText("P2");
  await expect(composer.getByRole("button", { name: "Label deep work", exact: true })).toBeVisible();
  await expect(composer.locator('[data-token-kind="date"]')).toHaveText("tomorrow");
  await expect(composer.locator('[data-token-kind="project"]')).toHaveText("#Home office");
  await expect(composer.locator('[data-token-kind="label"]')).toHaveText("@deep work");
  expect(creates).toBe(0);

  await input.press("Enter");
  await expect(input).toHaveValue("");
  expect(creates).toBe(1);
  const [saved] = await tasksIn(page, project.id);
  expect(saved).toMatchObject({ content: "Pay rent", projectId: project.id, priority: 2, dueTime: "09:00", durationMinutes: 30, labels: [expect.objectContaining({ id: label.id })] });
  expect(saved.dueDate).toBeTruthy();
  expect(saved.deadlineDate).toBeTruthy();
});

test("edits and removes detected fields, retaining unknown references", async ({ page }) => {
  const { composer, input, projectId } = await openComposer(page);
  await input.fill("buy milk tomorrow p1 @unknown #missing");
  await expect(composer.getByRole("button", { name: "Date", exact: true })).toContainText("Tomorrow");
  await input.fill("buy milk tomorro p1 @unknown #missing");
  await expect(composer.getByRole("button", { name: "Date", exact: true })).toHaveText("Date");
  await input.fill("buy milk tomorrow p1 @unknown #missing");
  await composer.getByRole("button", { name: "Remove date", exact: true }).click();
  await expect(input).not.toHaveValue(/tomorrow/);
  await composer.getByRole("button", { name: "Priority", exact: true }).click();
  await composer.getByRole("button", { name: "No priority" }).click();
  await expect(input).not.toHaveValue(/p1/);
  await input.press("Enter");
  await expect(input).toHaveValue("");
  const [saved] = await tasksIn(page, projectId);
  expect(saved).toMatchObject({ content: "buy milk @unknown #missing", priority: 4, dueDate: null, labels: [] });
});

test("plus menu applies description, dates, labels, reminders and retries only failed attachments", async ({ page }) => {
  const { composer, input, projectId } = await openComposer(page);
  await input.fill("Prepare workshop");
  await openAction(page, "Description");
  await composer.getByRole("textbox", { name: "Description", exact: true }).fill("Bring the printed checklist.");
  await openAction(page, "Date");
  await composer.getByLabel("Due date", { exact: true }).fill("2027-01-12");
  await composer.getByLabel("Due time", { exact: true }).fill("10:30");
  await composer.getByRole("button", { name: "Close date and repeat" }).click();
  await openAction(page, /^Priority/);
  await composer.getByRole("button", { name: "Priority 3" }).click();
  await openAction(page, /^Deadline/);
  await composer.getByLabel("Deadline date").fill("2027-01-15");
  await composer.getByRole("button", { name: "Close deadline" }).click();
  await openAction(page, "Duration");
  await composer.getByLabel("Duration in minutes").fill("45");
  await composer.getByRole("button", { name: "Close duration" }).click();
  await openAction(page, /^Labels/);
  await composer.getByLabel("Search or create labels").fill("workshop");
  await composer.getByRole("button", { name: "Create “workshop”" }).click();
  await expect(composer.getByRole("checkbox", { name: "workshop" })).toBeChecked();
  await composer.getByRole("button", { name: "Close labels" }).click();
  await openAction(page, "Reminders");
  await composer.getByLabel("Reminder date and time").fill("2027-01-12T09:30");
  await composer.getByRole("button", { name: "Add reminder", exact: true }).click();

  // Simulate an unavailable attachment service, then a successful retry.
  let uploads = 0;
  await page.route("**/api/attachments", async (route) => {
    uploads++;
    expect(route.request().postDataBuffer()?.toString()).toContain("checklist.txt");
    await route.fulfill({ status: uploads === 1 ? 503 : 201, json: uploads === 1 ? { error: "Unavailable" } : { id: "uploaded" } });
  });
  await composer.getByLabel("Attachments", { exact: true }).setInputFiles({ name: "checklist.txt", mimeType: "text/plain", buffer: Buffer.from("Workshop checklist") });
  await expect(composer.getByRole("button", { name: "Attachment checklist.txt", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(composer.getByRole("alert")).toContainText("Task added, but attachments couldn't be saved");
  await expect(input).toBeDisabled();
  expect(await tasksIn(page, projectId)).toHaveLength(1);
  await composer.getByRole("button", { name: "Retry details" }).click();
  await expect(input).toHaveValue("");
  expect(uploads).toBe(2);
  const tasks = await tasksIn(page, projectId);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ content: "Prepare workshop", description: "Bring the printed checklist.", dueDate: "2027-01-12", dueTime: "10:30", priority: 3, deadlineDate: "2027-01-15", durationMinutes: 45, labels: [expect.objectContaining({ name: "workshop" })] });
  const reminderResponse = await page.request.get(`/api/reminders?taskId=${tasks[0].id}`);
  expect(await reminderResponse.json()).toHaveLength(1);
});

test("the sidebar menu is usable above its dialog and Escape closes the active panel first", async ({ page }) => {
  await openComposer(page);
  await page.getByRole("form", { name: "New task" }).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("complementary").getByRole("button", { name: "New task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add task", exact: true });
  await dialog.getByRole("textbox", { name: "Task name", exact: true }).fill("Draft for review tomorrow");
  await openAction(page, /^Priority/);
  await dialog.getByRole("button", { name: "Priority 2" }).click();
  await expect(dialog.getByRole("button", { name: "Priority", exact: true })).toHaveText("P2");
  await openAction(page, /^Labels/);
  await dialog.getByLabel("Search or create labels").press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Search or create labels")).toBeHidden();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("failed task creation keeps the draft and supports a single retry", async ({ page }) => {
  const { composer, input, projectId } = await openComposer(page);
  let attempts = 0;
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) return route.abort();
    return route.continue();
  });
  await input.fill("Keep my draft tomorrow");
  await input.press("Enter");
  await expect(composer.getByRole("alert")).toContainText("Your draft is still here");
  await expect(input).toHaveValue("Keep my draft tomorrow");
  await expect(composer.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  await input.press("Enter");
  await expect(input).toHaveValue("");
  expect(await tasksIn(page, projectId)).toHaveLength(1);
});
