import { expect, test, type Page } from "@playwright/test";
import { registerVerifyAndLogin } from "./helpers";

async function addProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByPlaceholder("Project name").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(projectRow(page, name)).toBeVisible();
}

function projectRow(page: Page, name: string) {
  return page.locator(`[data-project-name="${name}"]`);
}

function favoriteProjectRow(page: Page, name: string) {
  return page.locator(`[data-favorite-project-name="${name}"]`);
}

async function rowY(page: Page, name: string) {
  const box = await projectRow(page, name).boundingBox();
  expect(box).not.toBeNull();
  return box!.y;
}

async function dragProject(
  page: Page,
  sourceName: string,
  targetName: string,
  horizontalOffset = 0,
) {
  const startingUrl = page.url();
  const source = await projectRow(page, sourceName).boundingBox();
  const target = await projectRow(page, targetName).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await expect(projectRow(page, sourceName)).toHaveCSS("cursor", "pointer");

  const persisted = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/projects/"),
  );
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 8, {
    steps: 2,
  });
  await expect(projectRow(page, sourceName)).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(
    target!.x + target!.width / 2 + horizontalOffset,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  const response = await persisted;
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(page.url()).toBe(startingUrl);
  await expect(projectRow(page, sourceName)).toHaveCSS("cursor", "pointer");
  return body as { parentId: string | null };
}

async function dragFavoriteProject(page: Page, sourceName: string, targetName: string) {
  const startingUrl = page.url();
  const source = await favoriteProjectRow(page, sourceName).boundingBox();
  const target = await favoriteProjectRow(page, targetName).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await expect(favoriteProjectRow(page, sourceName)).toHaveCSS("cursor", "pointer");

  const persisted = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/projects/"),
  );
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 8, {
    steps: 2,
  });
  await expect(favoriteProjectRow(page, sourceName)).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  const response = await persisted;
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(page.url()).toBe(startingUrl);
  await expect(favoriteProjectRow(page, sourceName)).toHaveCSS("cursor", "pointer");
}

test("projects drag from the whole row without a visible drag handle", async ({
  page,
  request,
}) => {
  const hydrationErrors: string[] = [];
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
    if (
      message.type() === "error" &&
      message.text().includes("A tree hydrated but some attributes")
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  const email = `e2e-${Date.now()}-projects@test.local`;
  await registerVerifyAndLogin(page, request, email);
  await addProject(page, "Alpha project");
  await addProject(page, "Beta project");
  // Login redirects through the root route in development, where Next.js can
  // emit an unrelated performance-measure warning. From this point onward we
  // only assert errors caused by project dragging and subsequent hydration.
  runtimeErrors.length = 0;
  hydrationErrors.length = 0;

  await expect(page.locator('[aria-label^="Drag "]')).toHaveCount(0);

  await dragProject(page, "Alpha project", "Beta project");

  await expect.poll(async () => (await rowY(page, "Alpha project")) > (await rowY(page, "Beta project"))).toBe(true);
  await page.reload();
  await expect.poll(async () => (await rowY(page, "Alpha project")) > (await rowY(page, "Beta project"))).toBe(true);

  // Match task-tree behavior: horizontal movement adjusts depth in the current
  // projected slot, so a row indents/outdents in place.
  const nested = await dragProject(page, "Alpha project", "Alpha project", 40);
  expect(nested.parentId).not.toBeNull();
  await page.reload();
  const betaPadding = await projectRow(page, "Beta project")
    .evaluate((row) => Number.parseFloat(getComputedStyle(row).paddingLeft));
  const nestedAlphaPadding = await projectRow(page, "Alpha project")
    .evaluate((row) => Number.parseFloat(getComputedStyle(row).paddingLeft));
  expect(nestedAlphaPadding).toBeGreaterThan(betaPadding);

  const unnested = await dragProject(page, "Alpha project", "Alpha project", -40);
  expect(unnested.parentId).toBeNull();
  await page.reload();
  const rootAlphaPadding = await projectRow(page, "Alpha project")
    .evaluate((row) => Number.parseFloat(getComputedStyle(row).paddingLeft));
  expect(rootAlphaPadding).toBe(betaPadding);

  // Regression: upward movement used to use a separate placement calculation
  // and could throw before persistence. It now shares the task-tree projection.
  await dragProject(page, "Alpha project", "Beta project");
  await expect.poll(async () => {
    const response = await page.request.get("/api/projects");
    const body = await response.json() as Array<{ name: string }>;
    return body
      .filter((project) => project.name === "Alpha project" || project.name === "Beta project")
      .map((project) => project.name);
  }).toEqual(["Alpha project", "Beta project"]);
  await expect.poll(async () => (await rowY(page, "Alpha project")) < (await rowY(page, "Beta project"))).toBe(true);
  await page.reload();
  await expect.poll(async () => (await rowY(page, "Alpha project")) < (await rowY(page, "Beta project"))).toBe(true);

  // The original navigation race was timing-dependent. Alternate directions
  // repeatedly and require every PATCH to finish without leaving this page.
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await dragProject(page, "Alpha project", "Beta project");
    await expect.poll(async () =>
      (await rowY(page, "Alpha project")) > (await rowY(page, "Beta project"))
    ).toBe(true);
    await dragProject(page, "Alpha project", "Beta project");
    await expect.poll(async () =>
      (await rowY(page, "Alpha project")) < (await rowY(page, "Beta project"))
    ).toBe(true);
  }
  await page.reload();
  await expect.poll(async () =>
    (await rowY(page, "Alpha project")) < (await rowY(page, "Beta project"))
  ).toBe(true);

  // Favorites are their own flat sortable list. Their order persists without
  // changing project-tree order or parent relationships.
  const projectsResponse = await page.request.get("/api/projects");
  const projectRecords = await projectsResponse.json() as Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>;
  const alphaProject = projectRecords.find((project) => project.name === "Alpha project")!;
  const betaProject = projectRecords.find((project) => project.name === "Beta project")!;
  await page.request.patch(`/api/projects/${alphaProject.id}`, { data: { isFavorite: true } });
  await page.request.patch(`/api/projects/${betaProject.id}`, { data: { isFavorite: true } });
  await page.reload();

  await dragFavoriteProject(page, "Alpha project", "Beta project");
  await expect.poll(async () => {
    const alpha = await favoriteProjectRow(page, "Alpha project").boundingBox();
    const beta = await favoriteProjectRow(page, "Beta project").boundingBox();
    return alpha!.y > beta!.y;
  }).toBe(true);
  expect(await rowY(page, "Alpha project")).toBeLessThan(await rowY(page, "Beta project"));
  await page.reload();
  await expect.poll(async () => {
    const alpha = await favoriteProjectRow(page, "Alpha project").boundingBox();
    const beta = await favoriteProjectRow(page, "Beta project").boundingBox();
    return alpha!.y > beta!.y;
  }).toBe(true);
  expect(await rowY(page, "Alpha project")).toBeLessThan(await rowY(page, "Beta project"));

  await dragFavoriteProject(page, "Alpha project", "Beta project");
  await page.reload();
  await expect.poll(async () => {
    const alpha = await favoriteProjectRow(page, "Alpha project").boundingBox();
    const beta = await favoriteProjectRow(page, "Beta project").boundingBox();
    return alpha!.y < beta!.y;
  }).toBe(true);
  expect(await rowY(page, "Alpha project")).toBeLessThan(await rowY(page, "Beta project"));
  const afterFavoriteMoves = await page.request.get("/api/projects");
  const movedProjects = await afterFavoriteMoves.json() as Array<{
    id: string;
    parentId: string | null;
  }>;
  expect(movedProjects.find((project) => project.id === alphaProject.id)?.parentId)
    .toBe(alphaProject.parentId);
  expect(movedProjects.find((project) => project.id === betaProject.id)?.parentId)
    .toBe(betaProject.parentId);

  // Exercise SSR hydration with both the sidebar and a draggable task row on
  // the page. Their DnD accessibility IDs must be stable across server/client.
  await projectRow(page, "Beta project").click();
  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  await page
    .getByPlaceholder("Task name (try: pay rent tomorrow p2 #Home @bills)")
    .fill("Hydration check");
  await page.getByRole("main").getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Hydration check", { exact: true })).toBeVisible();
  const taskRow = page.locator('[data-task-content="Hydration check"]');
  await expect(taskRow).toHaveCSS("cursor", "pointer");
  const taskBox = await taskRow.boundingBox();
  expect(taskBox).not.toBeNull();
  await page.mouse.move(taskBox!.x + taskBox!.width / 2, taskBox!.y + taskBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(taskBox!.x + taskBox!.width / 2, taskBox!.y + taskBox!.height / 2 + 8, {
    steps: 2,
  });
  await expect(taskRow).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(taskRow).toHaveCSS("cursor", "pointer");
  await page.reload();
  await expect(page.getByText("Hydration check", { exact: true })).toBeVisible();
  expect(hydrationErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
