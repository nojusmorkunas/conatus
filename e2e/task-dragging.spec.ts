import { expect, test, type Locator, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

type Task = { id: string; content: string; parentId: string | null; sectionId: string | null; order: string };

async function create(page: Page, resource: string, data: object) {
  const response = await page.request.post(`/api/${resource}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function fixture(page: Page) {
  await registerAndLogin(page, `drag-${Date.now()}-${test.info().workerIndex}`);
  const project = await create(page, "projects", { name: "Drag workshop", color: "blue" });
  const first = await create(page, "sections", { projectId: project.id, name: "First" });
  const second = await create(page, "sections", { projectId: project.id, name: "Second" });
  const empty = await create(page, "sections", { projectId: project.id, name: "Empty" });
  const add = (content: string, extra = {}) => create(page, "tasks", {
    projectId: project.id, sectionId: first.id, content, ...extra,
  });
  const alpha = await add("Alpha", { description: "A taller task with details that should stay visible while dragging.", dueDate: "2026-09-10", priority: 1 });
  const beta = await add("Beta");
  const gamma = await add("Gamma");
  const parent = await add("Parent", { sectionId: second.id });
  const childOne = await add("Child one", { sectionId: second.id, parentId: parent.id });
  const childTwo = await add("Child two", { sectionId: second.id, parentId: parent.id });
  const last = await add("Last", { sectionId: second.id });
  await page.goto(`/projects/${project.id}`);
  await expect(row(page, "Alpha")).toBeVisible();
  return { project, first, second, empty, alpha, beta, gamma, parent, childOne, childTwo, last };
}

function row(page: Page, content: string) {
  return page.getByRole("group", { name: `Task: ${content}`, exact: true });
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function pickUp(page: Page, content: string) {
  await row(page, content).scrollIntoViewIfNeeded();
  const rect = await box(row(page, content));
  const start = { x: rect.x + rect.width / 2, y: rect.y + 18 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await expect(row(page, content)).toHaveClass(/is-dragging/);
  return start;
}

async function persisted(page: Page, id: string) {
  const projectId = new URL(page.url()).pathname.split("/").at(-1);
  const response = await page.request.get(`/api/tasks?projectId=${projectId}`);
  expect(response.ok()).toBe(true);
  const tasks: Task[] = await response.json();
  return tasks.find(task => task.id === id)!;
}

test.use({ viewport: { width: 1280, height: 1100 } });

test("a cross-section drop lands before the indicated row and survives reload", async ({ page }) => {
  const f = await fixture(page);
  const start = await pickUp(page, "Beta");
  const target = await box(row(page, "Parent"));
  await page.mouse.move(start.x, target.y + 4, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => (await persisted(page, f.beta.id)).sectionId).toBe(f.second.id);
  await page.reload();
  const names = await page.locator("[data-task-content]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-task-content")));
  expect(names).toEqual(["Alpha", "Gamma", "Beta", "Parent", "Child one", "Child two", "Last"]);
});

test("the lifted preview keeps the original row height and metadata", async ({ page }) => {
  await fixture(page);
  const original = await box(row(page, "Alpha"));
  await pickUp(page, "Alpha");
  const ghost = page.locator(".task-drag-ghost");
  await expect(ghost).toContainText("A taller task with details");
  expect(Math.abs((await box(ghost)).height - original.height)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

async function moveToRow(page: Page, source: string, target: string, edge: "before" | "after", offsetX = 0) {
  const start = await pickUp(page, source);
  const rect = await box(row(page, target));
  await page.mouse.move(start.x + offsetX, edge === "before" ? rect.y + 3 : rect.y + rect.height - 3, { steps: 15 });
  await expect(page.getByTestId("task-drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
}

async function names(page: Page) {
  return page.locator("[data-task-content]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-task-content")));
}

test("reorders upward and downward with small drift, without opening details", async ({ page }) => {
  const f = await fixture(page);
  await moveToRow(page, "Gamma", "Alpha", "before", 12);
  await expect.poll(async () => (await persisted(page, f.gamma.id)).order < (await persisted(page, f.alpha.id)).order).toBe(true);
  await moveToRow(page, "Gamma", "Beta", "after", -12);
  await expect.poll(async () => (await persisted(page, f.gamma.id)).order > (await persisted(page, f.beta.id)).order).toBe(true);
  expect((await persisted(page, f.gamma.id)).parentId).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("nests and outdents in place using deliberate horizontal movement", async ({ page }) => {
  const f = await fixture(page);
  await moveToRow(page, "Gamma", "Gamma", "before", 28);
  await expect.poll(async () => (await persisted(page, f.gamma.id)).parentId).toBe(f.beta.id);
  await moveToRow(page, "Gamma", "Gamma", "before", -28);
  await expect.poll(async () => (await persisted(page, f.gamma.id)).parentId).toBeNull();
  await page.reload();
  expect((await names(page)).slice(0, 3)).toEqual(["Alpha", "Beta", "Gamma"]);
});

test("reorders children and promotes a child above its parent", async ({ page }) => {
  const f = await fixture(page);
  await moveToRow(page, "Child two", "Child one", "before");
  await expect.poll(async () => (await persisted(page, f.childTwo.id)).order < (await persisted(page, f.childOne.id)).order).toBe(true);
  expect((await persisted(page, f.childTwo.id)).parentId).toBe(f.parent.id);
  await moveToRow(page, "Child two", "Parent", "before");
  await expect.poll(async () => (await persisted(page, f.childTwo.id)).parentId).toBeNull();
  expect((await names(page)).slice(3)).toEqual(["Child two", "Parent", "Child one", "Last"]);
});

test("moves an entire subtree into an empty section", async ({ page }) => {
  const f = await fixture(page);
  const start = await pickUp(page, "Parent");
  // Children remain in place, but do not compete with real destinations.
  await expect(row(page, "Child one")).toHaveClass(/is-drag-descendant/);
  const target = await box(page.locator(`[data-task-group="${f.empty.id}"]`));
  await page.mouse.move(start.x, target.y + target.height - 8, { steps: 20 });
  await expect(page.getByTestId("task-drop-indicator")).toHaveAttribute("data-depth", "0");
  await page.mouse.up();
  await expect.poll(async () => (await persisted(page, f.parent.id)).sectionId).toBe(f.empty.id);
  for (const child of [f.childOne, f.childTwo]) {
    expect(await persisted(page, child.id)).toMatchObject({ sectionId: f.empty.id, parentId: f.parent.id });
  }
  await page.reload();
  expect((await names(page)).slice(-3)).toEqual(["Parent", "Child one", "Child two"]);
});

test("appends under a collapsed parent and reveals the moved task", async ({ page }) => {
  const f = await fixture(page);
  await row(page, "Parent").getByRole("button", { name: "Collapse subtasks" }).click();
  await expect(row(page, "Child one")).toHaveCount(0);
  await moveToRow(page, "Last", "Last", "before", 28);
  await expect.poll(async () => (await persisted(page, f.last.id)).parentId).toBe(f.parent.id);
  await expect(row(page, "Child one")).toBeVisible();
  expect((await names(page)).slice(-4)).toEqual(["Parent", "Child one", "Child two", "Last"]);
});

test("can drop into a collapsed section without targeting its invisible children", async ({ page }) => {
  const f = await fixture(page);
  const section = page.locator(`[data-task-group="${f.second.id}"]`);
  await section.getByRole("button", { name: "Collapse section", exact: true }).click();
  const start = await pickUp(page, "Beta");
  const target = await box(section);
  await page.mouse.move(start.x, target.y + target.height - 4, { steps: 15 });
  await expect(page.getByTestId("task-drop-indicator")).toHaveAttribute("data-after-id", f.last.id);
  await page.mouse.up();
  await expect.poll(async () => (await persisted(page, f.beta.id)).sectionId).toBe(f.second.id);
  await section.getByRole("button", { name: "Expand section", exact: true }).click();
  expect((await names(page)).slice(-1)).toEqual(["Beta"]);
});

test("Escape, dropping outside the list, and returning to the source do not save", async ({ page }) => {
  const f = await fixture(page);
  const original = await names(page);
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "PATCH") writes.push(request.url()); });
  await pickUp(page, "Beta");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await pickUp(page, "Beta");
  await page.mouse.move(20, 300, { steps: 10 });
  await expect(page.getByTestId("task-drop-indicator")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await moveToRow(page, "Beta", "Beta", "before");
  expect(await names(page)).toEqual(original);
  expect(writes).toEqual([]);
  expect((await persisted(page, f.beta.id)).parentId).toBeNull();
});

test("small pointer corrections keep rows stationary and the insertion line stable", async ({ page }) => {
  const f = await fixture(page);
  const before = await box(row(page, "Alpha"));
  const start = await pickUp(page, "Beta");
  for (const dx of [0, 3, -4, 2, -2, 0]) {
    await page.mouse.move(start.x + dx, before.y + 8 + Math.abs(dx), { steps: 3 });
    await expect(page.getByTestId("task-drop-indicator")).toHaveAttribute("data-before-id", f.alpha.id);
    expect((await box(row(page, "Alpha"))).y).toBe(before.y);
  }
  await page.screenshot({ path: test.info().outputPath("drag-in-progress.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("keyboard dragging reorders, nests, outdents and cancels", async ({ page }) => {
  const f = await fixture(page);
  const handle = page.getByRole("button", { name: "Move Gamma", exact: true });
  const indicator = page.getByTestId("task-drop-indicator");

  async function startDrag(depth: number) {
    await expect(handle).toBeFocused();
    // dnd-kit attaches its document listener on a timer after pickup.
    // A short key hold keeps the next key from arriving before it attaches.
    await page.keyboard.press("Space", { delay: 50 });
    await expect(row(page, "Gamma")).toHaveClass(/is-dragging/);
    await expect(indicator).toHaveAttribute("data-depth", String(depth));
  }

  await handle.focus();
  await startDrag(0);
  await page.keyboard.press("ArrowRight");
  await expect(indicator).toHaveAttribute("data-parent-id", f.beta.id);
  await expect(page.getByRole("status").filter({ hasText: "under Beta" })).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await persisted(page, f.gamma.id)).parentId).toBe(f.beta.id);
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await startDrag(1);
  await page.keyboard.press("ArrowLeft");
  await expect(indicator).toHaveAttribute("data-depth", "0");
  await expect(indicator).toHaveAttribute("data-parent-id", "");
  await page.keyboard.press("Space");
  await expect.poll(async () => (await persisted(page, f.gamma.id)).parentId).toBeNull();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await startDrag(0);
  await page.keyboard.press("ArrowUp");
  await expect(indicator).toHaveAttribute("data-before-id", f.beta.id);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await persisted(page, f.gamma.id)).order < (await persisted(page, f.beta.id)).order).toBe(true);
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await startDrag(0);
  await page.keyboard.press("ArrowDown");
  await expect(indicator).toHaveAttribute("data-after-id", f.beta.id);
  await page.keyboard.press("Escape");
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  expect((await names(page)).slice(0, 3)).toEqual(["Alpha", "Gamma", "Beta"]);
});

test("a failed save restores the stored order and a retry works", async ({ page }) => {
  const f = await fixture(page);
  await page.route(`**/api/tasks/${f.beta.id}`, route => route.fulfill({ status: 500, json: { error: "Test failure" } }));
  await moveToRow(page, "Beta", "Gamma", "after");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't move the task" })).toBeVisible();
  await expect.poll(async () => (await names(page)).slice(0, 3)).toEqual(["Alpha", "Beta", "Gamma"]);
  await page.unroute(`**/api/tasks/${f.beta.id}`);
  await moveToRow(page, "Beta", "Gamma", "after");
  await expect.poll(async () => (await persisted(page, f.beta.id)).order > (await persisted(page, f.gamma.id)).order).toBe(true);
});

test("rapid optimistic moves persist in the same order under a slow connection", async ({ page }) => {
  const f = await fixture(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/tasks/*", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    requests += 1;
    if (requests === 1) await held;
    await route.continue();
  });
  await moveToRow(page, "Beta", "Gamma", "after");
  await expect.poll(() => requests).toBe(1);
  expect((await names(page)).slice(0, 3)).toEqual(["Alpha", "Gamma", "Beta"]);
  await moveToRow(page, "Alpha", "Beta", "after");
  expect((await names(page)).slice(0, 3)).toEqual(["Gamma", "Beta", "Alpha"]);
  expect(requests).toBe(1);
  release();
  await expect.poll(() => requests).toBe(2);
  await expect.poll(async () => (await persisted(page, f.alpha.id)).order > (await persisted(page, f.beta.id)).order).toBe(true);
  await page.reload();
  expect((await names(page)).slice(0, 3)).toEqual(["Gamma", "Beta", "Alpha"]);
});

test("scrolls a long list at the edge, stops away from the edge, and cancels cleanly", async ({ page }) => {
  const f = await fixture(page);
  for (let index = 0; index < 35; index += 1) {
    await create(page, "tasks", { projectId: f.project.id, sectionId: f.first.id, content: `Long list ${index}` });
  }
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.reload();
  const start = await pickUp(page, "Alpha");
  const main = page.getByRole("main");
  await page.mouse.move(start.x, 696, { steps: 20 });
  await expect.poll(() => main.evaluate(node => node.scrollTop)).toBeGreaterThan(160);
  await page.mouse.move(start.x, 350, { steps: 2 });
  const stopped = await main.evaluate(node => node.scrollTop);
  // Observe several rendered frames, allowing the last scheduled scroll tick.
  await page.evaluate(() => new Promise<void>(resolve => {
    let frames = 0;
    const frame = () => ++frames === 15 ? resolve() : requestAnimationFrame(frame);
    requestAnimationFrame(frame);
  }));
  expect(Math.abs(await main.evaluate(node => node.scrollTop) - stopped)).toBeLessThan(12);
  await expect(page.getByTestId("task-drop-indicator")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
});

test("ordinary clicks and controls still work, and automatic sorting disables dragging", async ({ page }) => {
  await fixture(page);
  const original = await box(row(page, "Beta"));
  await page.mouse.move(original.x + original.width / 2, original.y + 15);
  await page.mouse.down();
  await page.mouse.move(original.x + original.width / 2 + 2, original.y + 16);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await row(page, "Beta").getByRole("button", { name: "More task actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sort tasks", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Priority", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move Beta", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await row(page, "Beta").getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(row(page, "Beta")).toHaveCount(0);
});

test("reduced motion drops immediately without losing the destination", async ({ page }) => {
  const f = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await moveToRow(page, "Beta", "Alpha", "before");
  await expect.poll(async () => (await persisted(page, f.beta.id)).order < (await persisted(page, f.alpha.id)).order).toBe(true);
  await expect(row(page, "Beta").locator("..")).toHaveCSS("opacity", "1");
});

test("section dragging only targets other sections", async ({ page }) => {
  const f = await fixture(page);
  const first = page.locator(`[data-task-group="${f.first.id}"]`);
  const second = page.locator(`[data-task-group="${f.second.id}"]`);
  const handle = await box(first.getByRole("button", { name: "Drag section", exact: true }));
  const target = await box(second.getByRole("heading", { name: "Second", exact: true }));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 9, { steps: 3 });
  await page.mouse.move(target.x, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => {
    const response = await page.request.get(`/api/sections?projectId=${f.project.id}`);
    return (await response.json()).map((section: { name: string }) => section.name);
  }).toEqual(["Second", "First", "Empty"]);
});

test("touch swipes scroll normally; a held drag reorders with the mobile indent step", async ({ page, context }) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const main = page.getByRole("main");
  await row(page, "Gamma").scrollIntoViewIfNeeded();
  const rect = await box(row(page, "Gamma"));
  const x = rect.x + rect.width / 2;
  const y = rect.y + 18;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 14 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".task-drag-ghost")).toHaveCount(0);
  await expect.poll(() => main.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await row(page, "Gamma").scrollIntoViewIfNeeded();
  const held = await box(row(page, "Gamma"));
  const heldY = held.y + 18;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: heldY }] });
  await expect(row(page, "Gamma")).toHaveClass(/is-dragging/);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 17, y: heldY }] });
  await expect(page.getByTestId("task-drop-indicator")).toHaveAttribute("data-depth", "1");
  await page.screenshot({ path: test.info().outputPath("mobile-drag.png") });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await persisted(page, f.gamma.id)).parentId).toBe(f.beta.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
