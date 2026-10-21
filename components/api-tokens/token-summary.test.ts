import { expect, test } from "vitest";

import { agentDefaultScopes } from "@/lib/token-access";
import type { TokenProject } from "@/components/api-tokens/api-tokens";
import { joinWithAnd, permissionSummary, projectsSummary } from "@/components/api-tokens/token-summary";

const projects: TokenProject[] = ["Work", "Clients", "Home", "Garden", "Old"].map((name, index) => ({
  id: name.toLowerCase(),
  name,
  color: "gray",
  parentId: null,
  isInbox: false,
  isArchived: index === 2,
  inTrash: index === 4,
  shared: index === 3,
}));

test("default permissions are grouped in catalog order", () => {
  expect(permissionSummary(agentDefaultScopes)).toEqual({
    legacy: false,
    chips: ["Tasks: read, write", "Projects and sections: read, write", "Labels: read, write", "Comments: read, write", "Reminders: read, write"],
  });
});

test("tokens with only unknown scopes are legacy", () => {
  expect(permissionSummary(["legacy:full"])).toEqual({ legacy: true, chips: ["legacy:full"] });
  expect(permissionSummary(["*"])).toEqual({ legacy: true, chips: ["*"] });
});

test("unknown scopes have their own chip alongside known permissions", () => {
  expect(permissionSummary(["custom:read", "labels:write", "tasks:read"])).toEqual({
    legacy: false,
    chips: ["Tasks: read", "Labels: write", "custom:read"],
  });
});

test("project summaries describe all projects or the listed names in project order", () => {
  expect(projectsSummary(null, projects)).toBe("All projects");
  expect(projectsSummary(["work"], projects)).toBe("Only Work");
  expect(projectsSummary(["home", "work", "clients"], projects)).toBe("Only Work, Clients and Home");
  expect(projectsSummary(["garden", "home", "clients", "work"], projects)).toBe("Only Work, Clients, Home and 1 more");
});

test("hidden selections stay visible in summaries", () => {
  expect(projectsSummary(["old"], projects)).toBe("1 unavailable project");
  expect(projectsSummary(["old", "missing"], projects)).toBe("2 unavailable projects");
  expect(projectsSummary(["work", "old", "missing"], projects)).toBe("Only Work and 2 unavailable");
});

test("joinWithAnd joins names without a comma before and", () => {
  expect(joinWithAnd(["A"])).toBe("A");
  expect(joinWithAnd(["A", "B"])).toBe("A and B");
  expect(joinWithAnd(["A", "B", "C"])).toBe("A, B and C");
});
