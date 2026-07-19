import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./helpers";

test("quick add parses due date and priority, drops unknown label token", async ({ page }) => {
  const username = `e2e-${Date.now()}-quickadd`;

  await registerAndLogin(page, username);

  // Registration lands on the app shell stub; navigate into the Inbox.
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/projects\//);

  await page.getByRole("main").getByRole("button", { name: "New task" }).click();
  const contentInput = page.getByPlaceholder("Task name (try: pay rent tomorrow p2 #Home @bills)");
  await contentInput.fill("buy milk tomorrow p1 @errands");
  await page.getByRole("main").getByRole("button", { name: "Add task" }).click();

  const row = page.getByText("buy milk", { exact: true });
  await expect(row).toBeVisible();

  // Tomorrow due chip renders next to the task.
  await expect(page.getByText("Tomorrow")).toBeVisible();

  // P1 priority renders as a red-ringed checkbox for this task. The exact
  // match skips the draggable row, which also carries role="button".
  const checkbox = page.getByRole("button", { name: "Mark complete", exact: true });
  await expect(checkbox).toHaveClass(/border-red-500/);
});
