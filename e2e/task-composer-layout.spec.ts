import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { registerAndLogin } from "./helpers";

test("composer highlights align and controls fit desktop and narrow mobile layouts", async ({ page }) => {
  await registerAndLogin(page, `e2e-${Date.now()}-layout`);
  const projects = await (await page.request.get("/api/projects")).json();
  const inbox = projects.find((project: { isInbox: boolean }) => project.isInbox);
  await page.request.post("/api/labels", { data: { name: "bills" } });
  for (const content of ["Book dentist appointment", "Pick up the parcel", "Review the weekend plans"]) {
    await page.request.post("/api/tasks", { data: { projectId: inbox.id, content } });
  }
  await page.goto(`/projects/${inbox.id}`);
  await page.getByRole("main").getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("form", { name: "New task" });
  const input = form.getByRole("textbox", { name: "Task name", exact: true });
  await expect(form.getByRole("button", { name: "Project and section" })).toContainText("Inbox");
  await input.fill("Pay rent tomorrow p2 #Inbox @bills");
  await expect(form.locator('[data-token-kind="date"]')).toHaveText("tomorrow");
  const reviewDir = process.env.COMPOSER_REVIEW_DIR;
  if (reviewDir) await mkdir(reviewDir, { recursive: true });

  for (const [name, width, height, dark] of [
    ["desktop", 1280, 900, false],
    ["user-1093", 1093, 922, true],
    ["mobile", 390, 844, true],
    ["mobile-small", 320, 780, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((isDark) => document.documentElement.classList.toggle("dark", isDark), dark);
    // The mirror and textarea must have the same wrap width and typography.
    const geometry = await form.evaluate((element) => {
      const input = element.querySelector("textarea")!;
      const mirror = element.querySelector<HTMLElement>("[data-composer-highlights]")!;
      return { inputWidth: input.clientWidth, mirrorWidth: mirror.clientWidth, inputFont: getComputedStyle(input).font, mirrorFont: getComputedStyle(mirror).font, overflowing: element.scrollWidth > element.clientWidth + 1, viewportOverflowing: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(geometry.inputWidth).toBe(geometry.mirrorWidth);
    expect(geometry.inputFont).toBe(geometry.mirrorFont);
    expect(geometry.overflowing).toBe(false);
    expect(geometry.viewportOverflowing).toBe(false);
    await form.getByRole("button", { name: "Add task details" }).click();
    const menu = page.getByRole("menu", { name: "Add task details" });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (reviewDir) await page.screenshot({ path: `${reviewDir}/${name}.png`, fullPage: true, animations: "disabled" });
    await menu.press("Escape");
  }

  await input.fill("Discuss ".repeat(45) + "tomorrow p2");
  await expect(form.locator('[data-token-kind="date"]')).toHaveText("tomorrow");
  await expect(form.getByRole("button", { name: "Add task", exact: true })).toBeInViewport();
  await form.getByRole("button", { name: "Date", exact: true }).click();
  await expect(form.getByLabel("Due date", { exact: true })).toBeInViewport();
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
