import { describe, expect, it } from "vitest";

import { backOnlineText, changesSynced, decisionsText } from "./sync-status";

describe("changesSynced", () => {
  it("counts what left the queue since the connection came back", () => {
    expect(changesSynced(3, 0)).toBe(3);
    expect(changesSynced(3, 1)).toBe(2);
  });

  it("never goes negative when changes were queued during the sync", () => {
    expect(changesSynced(1, 4)).toBe(0);
  });
});

describe("backOnlineText", () => {
  it("says nothing synced when nothing went out", () => {
    expect(backOnlineText(0)).toBe("You're back online");
  });

  it("uses the singular for one change", () => {
    expect(backOnlineText(1)).toBe("Back online · 1 change synced");
  });

  it("uses the plural otherwise", () => {
    expect(backOnlineText(3)).toBe("Back online · 3 changes synced");
  });
});

describe("decisionsText", () => {
  it("words conflicts", () => {
    expect(decisionsText(1, 0)).toBe("1 task was changed on another device too");
    expect(decisionsText(2, 0)).toBe("2 tasks were changed on another device too");
  });

  it("words failed changes", () => {
    expect(decisionsText(0, 1)).toBe("1 change couldn't sync");
    expect(decisionsText(0, 2)).toBe("2 changes couldn't sync");
  });

  it("combines both into one decision count", () => {
    expect(decisionsText(1, 2)).toBe("3 changes need a decision");
  });
});
