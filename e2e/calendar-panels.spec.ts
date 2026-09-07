import { expect, test } from "@playwright/test";
import { registerAndLogin } from "./helpers";

test("calendar projects repeats, preserves the selected period, and recovers a failed move", async ({ page }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-calendar`);
  const projects = await (await page.request.get("/api/projects")).json();
  const projectId = projects.find((project: { isInbox: boolean }) => project.isInbox).id;
  const response = await page.request.post("/api/tasks", { data: {
    projectId, content: "Calendar repeat regression", dueDate: "2027-01-31", recurrence: "every month",
  } });
  expect(response.ok()).toBeTruthy();
  const task = await response.json();
  await page.goto("/calendar?view=month&month=2027-03");
  const preview = page.locator('[data-occurrence-date="2027-03-31"]').filter({ hasText: "Calendar repeat regression" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-projection", "true");
  await page.getByRole("link", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/week=2027-03-01/);
  await page.goto("/calendar?view=week&week=2027-03-31");
  await expect(preview).toBeVisible();

  await page.goto("/calendar?view=week&week=2027-01-31");
  const current = page.locator('[data-occurrence-date="2027-01-31"]').filter({ hasText: "Calendar repeat regression" });
  await expect(current).toBeVisible();
  await page.route(`**/api/tasks/${task.id}`, (route) => route.abort());
  const box = (await current.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x - box.width * 0.6, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't move the task" })).toBeVisible();
  await expect(current).toBeVisible();
  await page.unroute(`**/api/tasks/${task.id}`);
  const retryBox = (await current.boundingBox())!;
  await page.mouse.move(retryBox.x + retryBox.width / 2, retryBox.y + retryBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(retryBox.x + retryBox.width / 2 + 10, retryBox.y + retryBox.height / 2, { steps: 3 });
  await page.mouse.move(retryBox.x - retryBox.width * 0.6, retryBox.y + retryBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-occurrence-date="2027-01-30"]').filter({ hasText: "Calendar repeat regression" })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/tasks?projectId=${projectId}`)).json()).find((entry: { id: string }) => entry.id === task.id).dueDate).toBe("2027-01-30");
  await page.screenshot({ path: "/tmp/conatus-calendar-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/conatus-calendar-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("sidebar width persists and project comments fill the viewport and retain failed drafts", async ({ page }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-panels`);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  const sidebar = page.locator("#project-sidebar-panel");
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const initial = (await sidebar.boundingBox())!.width;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 80);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 64, grip.y + 80, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(initial + 64);
  await page.reload();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(initial + 64);
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(initial + 56);

  const trigger = page.getByRole("button", { name: "Open project comments" });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Comments: Inbox" });
  await expect(panel).toBeVisible();
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.y).toBe(0);
  expect(panelBox.height).toBe(page.viewportSize()!.height);
  const draft = panel.getByRole("textbox", { name: "Add a comment" });
  await draft.fill("Keep this draft after failure");
  await page.route("**/api/comments", (route) => route.abort());
  await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(draft).toHaveValue("Keep this draft after failure");
  await page.unroute("**/api/comments");
  await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(panel.getByText("Keep this draft after failure", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("");
  await page.screenshot({ path: "/tmp/conatus-comments-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.height).toBe(844);
  await page.screenshot({ path: "/tmp/conatus-comments-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
