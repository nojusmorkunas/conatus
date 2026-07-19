import { test, expect, type Page } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { registerVerifyAndLogin } from "./helpers";

async function register(page: Page, request: APIRequestContext, email: string) {
  await registerVerifyAndLogin(page, request, email);
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
}

test("owner shares a project with a collaborator who gets read access", async ({ browser, request }) => {
  const stamp = Date.now();
  const emailA = `e2e-${stamp}-owner@test.local`;
  const emailB = `e2e-${stamp}-member@test.local`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await register(pageA, request, emailA);

    // A creates a project and a task inside it.
    await pageA.getByRole("button", { name: "Add project" }).click();
    await pageA.getByPlaceholder("Project name").fill("Shared E2E");
    await pageA.getByRole("button", { name: "Add", exact: true }).click();
    await pageA.getByRole("link", { name: "Shared E2E" }).click();
    await expect(pageA).toHaveURL(/\/projects\//);

    await pageA.getByRole("main").getByRole("button", { name: "New task" }).click();
    await pageA.getByPlaceholder("Task name (try: pay rent tomorrow p2 #Home @bills)").fill("shared task");
    await pageA.getByRole("main").getByRole("button", { name: "Add task" }).click();
    await expect(pageA.getByText("shared task", { exact: true })).toBeVisible();

    // B registers in a separate context.
    await register(pageB, request, emailB);

    // A shares the project with B's email.
    await pageA.getByRole("button", { name: "Project options" }).click();
    await pageA.getByRole("menuitem", { name: "Share", exact: true }).click();
    const shareEmailInput = pageA.getByPlaceholder("Add member by email");
    await shareEmailInput.fill(emailB);
    await shareEmailInput.press("Enter");
    await expect(pageA.getByText(emailB)).toBeVisible();

    // B sees the shared project in their sidebar and can open it.
    await pageB.reload();
    const sharedLink = pageB.getByRole("link", { name: "Shared E2E" });
    await expect(sharedLink).toBeVisible();
    await sharedLink.click();
    await expect(pageB).toHaveURL(/\/projects\//);
    await expect(pageB.getByText("shared task", { exact: true })).toBeVisible();

    // B is an editor, not the owner: no share-management affordance.
    await pageB.getByRole("button", { name: "Project options" }).click();
    const viewMembersItem = pageB.getByRole("menuitem", { name: "View members" });
    await expect(viewMembersItem).toBeVisible();
    await expect(pageB.getByRole("menuitem", { name: "Share", exact: true })).toHaveCount(0);
    await viewMembersItem.click();
    await expect(pageB.getByPlaceholder("Add member by email")).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
