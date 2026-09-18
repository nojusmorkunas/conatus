import { describe, expect, it } from "vitest";

import { startPageHref } from "./start-page";

const inbox = { inboxProjectId: "inbox-id", projectIds: ["inbox-id", "work-id"] };

describe("startPageHref", () => {
  it("maps views to their routes", () => {
    expect(startPageHref("today", inbox)).toBe("/today");
    expect(startPageHref("calendar", inbox)).toBe("/calendar");
  });

  it("resolves inbox to the user's own inbox project", () => {
    expect(startPageHref("inbox", inbox)).toBe("/projects/inbox-id");
  });

  it("opens a chosen project", () => {
    expect(startPageHref("work-id", inbox)).toBe("/projects/work-id");
  });

  it("falls back when the chosen project is gone", () => {
    expect(startPageHref("deleted-id", inbox)).toBe("/today");
    expect(startPageHref("inbox", { inboxProjectId: null, projectIds: [] })).toBe("/today");
  });
});
