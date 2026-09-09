/**
 * Captures the screenshots used by the useconatus landing page.
 *
 * Run against a seeded dev server:
 *
 *   npm run dev:local        # Postgres + MinIO + migrations + next dev
 *   npm run db:seed
 *   npx tsx scripts/marketing-shots.ts
 *
 * Everything is captured from real UI at deviceScaleFactor 2 and written as
 * full-colour PNG straight into the site repo. There is deliberately no
 * ImageMagick pass: the site's Astro build re-encodes to WebP, so quantising
 * here only hands sharp a degraded input, and hand-computed `-crop x+y` offsets
 * silently drift every time the layout moves. Bounding boxes come from the
 * elements themselves instead.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium, type Locator, type Page } from "@playwright/test";

const baseURL = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const username = process.env.SEED_USERNAME ?? "admin";
const password = process.env.SEED_PASSWORD ?? "admin12345";
const outDir = resolve(
  import.meta.dirname,
  process.env.SHOTS_OUT ?? "../../useconatus/src/assets",
);

// The hero gets the whole window. The feature rows show their image in roughly
// a 580px column, so those are captured from a narrower window instead of
// cropped out of a wide one: a task row's text is only ~250px, and a 1100px
// container around it is mostly empty space — which is the single worst thing
// about the screenshots this script replaces.
const HERO_VIEWPORT = { width: 1180, height: 940 };
const CROP_VIEWPORT = { width: 960, height: 840 };

async function save(name: string, buffer: Buffer) {
  const path = resolve(outDir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  console.log(`  ${name}  ${(buffer.length / 1024).toFixed(0)} KB`);
}

/**
 * Screenshot the horizontal extent of `column`, `height` CSS px tall, starting
 * at `from` (defaults to the top of the column). The `from` anchor is how the
 * section shots skip the empty "no section" band the app renders above the
 * first real section: an element, not a guessed y offset.
 */
async function shotRegion(
  page: Page,
  column: Locator,
  height: number,
  from?: Locator,
  padTop = 20,
) {
  const box = await column.boundingBox();
  if (!box) throw new Error("column has no bounding box");
  const anchor = from ? await from.boundingBox() : null;
  const top = anchor ? Math.max(0, anchor.y - padTop) : box.y;
  return page.screenshot({
    clip: { x: box.x, y: top, width: box.width, height: Math.min(height, box.height + box.y - top) },
  });
}

async function login(page: Page) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/**
 * The importer's step 2 is the only screen worth showing for the Todoist row,
 * and reaching it needs a live Todoist token. Stub the preview response so it
 * renders representative counts — the same standing as the seeded tasks: real
 * UI, fixture data.
 */
async function stubImportPreview(page: Page) {
  const project = (
    name: string,
    tasks: number,
    sections: number,
    comments: number,
    subtasks = 0,
    extra: Record<string, unknown> = {},
  ) => ({
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    sections,
    tasks,
    subtasks,
    comments,
    warnings: [],
    recurringDatesNeedingReview: [],
    nameConflict: false,
    ...extra,
  });

  const projects = [
    project("Work", 64, 5, 22, 18),
    project("Website Redesign", 41, 4, 13, 9, { nameConflict: true }),
    project("Personal", 37, 2, 4, 6),
    project("Home", 23, 3, 2, 5),
    project("Reading List", 19, 0, 1),
  ];
  const totals = projects.reduce(
    (sum, item) => ({
      projects: sum.projects + 1,
      sections: sum.sections + item.sections,
      tasks: sum.tasks + item.tasks,
      comments: sum.comments + item.comments,
    }),
    { projects: 0, sections: 0, tasks: 0, comments: 0 },
  );

  await page.route("**/api/import/todoist/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projects, totals }),
    }),
  );
}

async function main() {
  const browser = await chromium.launch();

  async function openPage(viewport: { width: number; height: number }) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    // Blinking carets and half-finished transitions are the two things that
    // make a screenshot look like it was taken by accident.
    await context.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;
      document.addEventListener("DOMContentLoaded", () => document.head.append(style));
    });
    const page = await context.newPage();
    await login(page);
    return page;
  }

  console.log(`Capturing to ${outDir}`);

  // --- Hero: the whole application window -------------------------------
  const hero = await openPage(HERO_VIEWPORT);
  await hero.goto(`${baseURL}/today`);
  await hero.getByText("Build responsive homepage prototype").waitFor();
  await hero.mouse.move(HERO_VIEWPORT.width - 1, HERO_VIEWPORT.height - 1);
  await save("app_window.png", await hero.screenshot());
  await hero.context().close();

  const page = await openPage(CROP_VIEWPORT);
  const main_ = page.locator("main");
  // Sidebar projects are sortable divs, not links, and each name also appears
  // under Pinned. data-project-name is the tree entry and is unique.
  const project = (name: string) => page.locator(`[data-project-name="${name}"]`);
  // Rows reveal a "More options" button under the cursor; park it out of the way.
  const parkPointer = () => page.mouse.move(CROP_VIEWPORT.width - 1, CROP_VIEWPORT.height - 1);

  await project("Website Redesign").click();
  await page.waitForURL(/\/projects\//);
  const projectUrl = page.url();

  // --- Projects and sections ---------------------------------------------
  // Anchored on the first section heading, because the app renders an empty
  // unsectioned band above it that would otherwise open the shot with a void.
  await page.getByText("Build responsive homepage prototype").waitFor();
  await parkPointer();
  await save(
    "sections.png",
    await shotRegion(page, main_, 620, page.getByText("Backlog", { exact: true }).first()),
  );

  // --- Comments and attachments ------------------------------------------
  // The project page opens a task from ?task=<id>. Clicking the row would also
  // work, but task-row.tsx ignores clicks that land on a button or link, and
  // the title is one — so drive it through the URL the app already supports.
  const rowFor = (content: string) =>
    page.locator("[data-task-id]").filter({ hasText: content }).first();
  const prototypeId = await rowFor("Build responsive homepage prototype").getAttribute("data-task-id");
  await page.goto(`${projectUrl}?task=${prototypeId}`);
  const modal = page.getByRole("dialog").filter({ hasText: "Build responsive homepage" });
  await modal.getByText("breakpoints.csv").waitFor();
  // Opening the panel focuses its close button, which draws a focus ring.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await parkPointer();
  await save("task_comments.png", await shotRegion(page, modal, 560));

  // --- Recurrence and deadlines -----------------------------------------
  // Drop the ?task= param: the open panel's backdrop swallows sidebar clicks.
  await page.goto(projectUrl);
  await project("Personal").click();
  await page.waitForURL(/\/projects\//);
  await page.getByText("Weekly meal planning").waitFor();
  await parkPointer();
  await save("recurrence.png", await shotRegion(page, main_, 560));

  // --- Todoist import -----------------------------------------------------
  await stubImportPreview(page);
  await page.goto(`${baseURL}/settings/import`);
  await page.getByLabel("Todoist API token").fill("0123456789abcdef0123456789abcdef01234567");
  await page.getByRole("button", { name: "Review projects" }).click();
  await page.getByText("Ready to import").waitFor();
  await parkPointer();
  // Settings nests its own <main> inside the app shell's; the inner one is the
  // max-w-4xl content column. Anchor on the step indicator to skip the page
  // heading and open on the part that shows what an import actually does.
  await save(
    "todoist_import.png",
    await shotRegion(page, page.locator("main").last(), 600, page.getByText("Connect or upload")),
  );

  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
