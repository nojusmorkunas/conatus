import { expect, test, type Page } from "@playwright/test";

import { queuedChanges, registerAndLogin } from "./helpers";

// The worker only registers in production builds, which CI serves with PLAYWRIGHT_SKIP_WEBSERVER.
test.skip(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1", "The service worker only registers in production builds.");
test.use({ serviceWorkers: "allow", viewport: { width: 1280, height: 1100 } });

const projectRow = (page: Page, name: string) => page.locator(`[data-project-name="${name}"]`);

const sidebarOrder = (page: Page) =>
  page.locator("[data-project-name]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-project-name")));

// dnd-kit swallows clicks for 50 ms after a drop, so a click straight after one is lost.
async function dragBelow(page: Page, sourceName: string, targetName: string) {
  const source = (await projectRow(page, sourceName).boundingBox())!;
  const target = (await projectRow(page, targetName).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 8, { steps: 2 });
  await expect(projectRow(page, sourceName)).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(projectRow(page, sourceName)).toHaveCSS("cursor", "pointer");
}

test("the sidebar's projects and labels change offline and reach the server afterwards", async ({ page }) => {
  await registerAndLogin(page, `offline-sidebar-${Date.now()}-${test.info().workerIndex}`);
  // One after the other: the server numbers each from the last, so two at once get the same place.
  const alpha = (await (await page.request.post("/api/projects", { data: { name: "Alpha" } })).json()) as { id: string };
  await page.request.post("/api/projects", { data: { name: "Beta" } });

  await page.goto(`/projects/${alpha.id}`);
  await expect(projectRow(page, "Beta")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Reloaded under the worker, so this page is cached.
  await page.reload();
  await expect(projectRow(page, "Beta")).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: /^You're offline/ })).toBeVisible();

  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByPlaceholder("Project name").fill("Offline made");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(projectRow(page, "Offline made")).toBeVisible();

  await page.getByRole("button", { name: "More options for Alpha", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  // The name's input has focus as it opens.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Alpha renamed");
  await page.keyboard.press("Enter");
  await expect(projectRow(page, "Alpha renamed")).toBeVisible();

  // A label is made where tasks are added.
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill("Labelled");
  await page.getByRole("button", { name: "Add task details" }).click();
  await page.getByRole("menuitem", { name: /Labels/ }).click();
  await page.getByRole("textbox", { name: "Search or create labels" }).fill("errand");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add task", exact: true }).click();

  await dragBelow(page, "Alpha renamed", "Beta");
  await expect.poll(() => sidebarOrder(page)).toEqual(["Beta", "Alpha renamed", "Offline made"]);

  await expect.poll(() => queuedChanges(page)).toBeGreaterThanOrEqual(5);
  await page.reload();
  await expect.poll(() => sidebarOrder(page)).toEqual(["Beta", "Alpha renamed", "Offline made"]);

  await page.context().setOffline(false);
  await expect.poll(async () => {
    const projects = (await (await page.request.get("/api/v1/projects")).json()) as { name: string; isInbox: boolean }[];
    const labels = (await (await page.request.get("/api/v1/labels")).json()) as { name: string }[];
    return { projects: projects.filter((project) => !project.isInbox).map((project) => project.name), labels: labels.map((label) => label.name) };
  }, { timeout: 30_000 }).toEqual({ projects: ["Beta", "Alpha renamed", "Offline made"], labels: ["errand"] });
});
