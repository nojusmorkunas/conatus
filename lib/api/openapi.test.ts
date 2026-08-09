import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { GET } from "@/app/api/v1/openapi.json/route";

// Reads the route source rather than importing it: the handlers pull in the
// database client at module scope, and this only needs their export names.
async function exportedMethods(apiPath: string) {
  const source = await readFile(
    path.join(
      process.cwd(),
      "app/api/v1",
      apiPath.replace(/\{(\w+)\}/g, "[$1]"),
      "route.ts",
    ),
    "utf8",
  );

  const methods = new Set<string>();
  for (const [, name] of source.matchAll(/export\s+async\s+function\s+([A-Z]+)/g)) {
    methods.add(name);
  }
  for (const [, group] of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of group.split(",")) {
      const name = entry.trim().split(/\s+as\s+/).pop()?.trim() ?? "";
      if (/^[A-Z]+$/.test(name)) methods.add(name);
    }
  }
  return [...methods];
}

describe("v1 OpenAPI contract", () => {
  test("documents every public resource and uses unique operation ids", async () => {
    const response = await GET();
    const contract = await response.json();
    expect(contract.openapi).toBe("3.1.0");
    expect(contract.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(contract.paths)).toEqual(expect.arrayContaining([
      "/auth/device-token", "/context", "/projects", "/projects/{id}", "/tasks", "/tasks/{id}",
      "/tasks/quick-add", "/sections", "/sections/{id}", "/labels", "/labels/{id}",
      "/comments", "/comments/{id}", "/reminders", "/reminders/{id}",
    ]));

    const operationIds = Object.values(contract.paths as Record<string, Record<string, { operationId?: string }>>)
      .flatMap((path) => Object.values(path).map((operation) => operation.operationId))
      .filter(Boolean);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  // A documented operation with no handler answers 405, which only shows up
  // once someone generates a client from the contract and calls it.
  test("every documented operation has a route handler", async () => {
    const contract = await (await GET()).json();

    for (const [apiPath, operations] of Object.entries(
      contract.paths as Record<string, Record<string, unknown>>,
    )) {
      const methods = await exportedMethods(apiPath);
      for (const method of Object.keys(operations)) {
        expect(methods, `${method.toUpperCase()} ${apiPath}`).toContain(
          method.toUpperCase(),
        );
      }
    }
  });

  test("only the device-token route is reachable without a token", async () => {
    const contract = await (await GET()).json();
    const unauthenticated = Object.entries(
      contract.paths as Record<string, Record<string, { security?: unknown[] }>>,
    )
      .flatMap(([apiPath, operations]) =>
        Object.entries(operations).map(([method, operation]) => ({
          route: `${method.toUpperCase()} ${apiPath}`,
          open: Array.isArray(operation.security) && operation.security.length === 0,
        })),
      )
      .filter((entry) => entry.open)
      .map((entry) => entry.route);

    expect(unauthenticated).toEqual(["POST /auth/device-token"]);
  });
});
