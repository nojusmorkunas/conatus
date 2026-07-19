import { describe, expect, test } from "vitest";

import { GET } from "@/app/api/v1/openapi.json/route";

describe("v1 OpenAPI contract", () => {
  test("documents every public resource and uses unique operation ids", async () => {
    const response = await GET();
    const contract = await response.json();
    expect(contract.openapi).toBe("3.1.0");
    expect(contract.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(contract.paths)).toEqual(expect.arrayContaining([
      "/context", "/projects", "/projects/{id}", "/tasks", "/tasks/{id}",
      "/tasks/quick-add", "/sections", "/sections/{id}", "/labels", "/labels/{id}",
      "/comments", "/comments/{id}", "/reminders", "/reminders/{id}",
    ]));

    const operationIds = Object.values(contract.paths as Record<string, Record<string, { operationId?: string }>>)
      .flatMap((path) => Object.values(path).map((operation) => operation.operationId))
      .filter(Boolean);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });
});
