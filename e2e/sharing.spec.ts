import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

async function register(page: Page, username: string) {
  await registerAndLogin(page, username);
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
}

test("owner shares a project with a collaborator who gets read access", async ({ browser }) => {
  const stamp = Date.now();
  const usernameA = `e2e-${stamp}-owner`;
  const usernameB = `e2e-${stamp}-member`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await register(pageA, usernameA);

    // A creates a project and a task inside it.
    await pageA.getByRole("button", { name: "Add project" }).click();
    await pageA.getByPlaceholder("Project name").fill("Shared E2E");
    await pageA.getByRole("button", { name: "Add", exact: true }).click();
    await pageA.getByText("Shared E2E", { exact: true }).click();
    await expect(pageA).toHaveURL(/\/projects\//);

    await pageA.getByRole("main").getByRole("button", { name: "New task" }).click();
    await pageA.getByPlaceholder("Task name (try: pay rent tomorrow p2 #Home @bills)").fill("shared task");
    await pageA.getByRole("main").getByRole("button", { name: "Add task" }).click();
    await expect(pageA.getByText("shared task", { exact: true })).toBeVisible();

    // B registers in a separate context.
    await register(pageB, usernameB);

    // A shares the project with B's username.
    await pageA.getByRole("button", { name: "Project options" }).click();
    await pageA.getByRole("menuitem", { name: "Share", exact: true }).click();
    const shareUsernameInput = pageA.getByPlaceholder("Add member by username");
    await shareUsernameInput.fill(usernameB);
    await shareUsernameInput.press("Enter");
    await expect(pageA.getByText(usernameB)).toBeVisible();

    // B sees the shared project in their sidebar and can open it.
    await pageB.reload();
    const sharedProject = pageB.getByText("Shared E2E", { exact: true });
    await expect(sharedProject).toBeVisible();
    await sharedProject.click();
    await expect(pageB).toHaveURL(/\/projects\//);
    await expect(pageB.getByText("shared task", { exact: true })).toBeVisible();

    // B is an editor, not the owner: no share-management affordance.
    await pageB.getByRole("button", { name: "Project options" }).click();
    const viewMembersItem = pageB.getByRole("menuitem", { name: "View members" });
    await expect(viewMembersItem).toBeVisible();
    await expect(pageB.getByRole("menuitem", { name: "Share", exact: true })).toHaveCount(0);
    await viewMembersItem.click();
    await expect(pageB.getByPlaceholder("Add member by username")).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
