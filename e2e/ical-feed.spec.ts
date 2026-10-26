import { expect, test, type Browser, type Page } from "@playwright/test";

import { registerAndLogin } from "./helpers";

async function newUser(browser: Browser, username: string) {
  const page = await (await browser.newContext()).newPage();
  await registerAndLogin(page, username);
  return page;
}

async function createProject(page: Page, name: string) {
  const response = await page.request.post("/api/projects", { data: { name } });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string };
}

async function share(page: Page, projectId: string, username: string) {
  const response = await page.request.post(`/api/projects/${projectId}/collaborators`, { data: { username } });
  expect(response.status()).toBe(201);
  return await response.json() as { userId: string };
}

async function createTask(page: Page, projectId: string, content: string) {
  const response = await page.request.post("/api/tasks", {
    data: { projectId, content, dueDate: "2099-01-15" },
  });
  expect(response.status()).toBe(201);
}

async function feed(page: Page) {
  const tokenResponse = await page.request.post("/api/settings/ical-token");
  expect(tokenResponse.status()).toBe(200);
  const { token } = await tokenResponse.json() as { token: string };
  const response = await page.request.get(`/api/ical/${token}`);
  expect(response.status()).toBe(200);
  return await response.text();
}

// The feed follows project access like Upcoming does. tasks.userId is only
// the creator, so filtering on it leaked deleted and left projects and hid
// tasks other members added.
test("the calendar feed covers reachable projects, whoever created the task", async ({ browser }) => {
  const stamp = Date.now();
  const memberName = `e2e-${stamp}-ical-member`;
  const owner = await newUser(browser, `e2e-${stamp}-ical-owner`);
  const member = await newUser(browser, memberName);

  try {
    const shared = await createProject(owner, "Shared");
    const left = await createProject(owner, "Left");
    const doomed = await createProject(owner, "Doomed");
    await share(owner, shared.id, memberName);
    const { userId: memberId } = await share(owner, left.id, memberName);

    await createTask(member, shared.id, "Member task in shared project");
    await createTask(member, left.id, "Member task in left project");
    await createTask(owner, doomed.id, "Owner task in deleted project");

    const leave = await member.request.delete(`/api/projects/${left.id}/collaborators`, { data: { userId: memberId } });
    expect(leave.status()).toBe(200);
    const remove = await owner.request.delete(`/api/projects/${doomed.id}`);
    expect(remove.status()).toBe(200);

    const ownerFeed = await feed(owner);
    expect(ownerFeed).toContain("SUMMARY:Member task in shared project");
    expect(ownerFeed).toContain("SUMMARY:Member task in left project");
    expect(ownerFeed).not.toContain("SUMMARY:Owner task in deleted project");

    const memberFeed = await feed(member);
    expect(memberFeed).toContain("SUMMARY:Member task in shared project");
    expect(memberFeed).not.toContain("SUMMARY:Member task in left project");
  } finally {
    await owner.context().close();
    await member.context().close();
  }
});
