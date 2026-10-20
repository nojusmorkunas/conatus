import { expect, test } from "vitest";

import { agentDefaultScopes, agentTokenScopes, coveredProjectIds, tokenPermissionGroups, tokenScopePresets } from "./token-access";

test("the permission catalog matches every scope in order", () => {
  expect(tokenPermissionGroups.flatMap((group) => group.permissions.map((permission) => permission.scope))).toEqual(agentTokenScopes);
});

test("presets grant read, read and write, or every permission", () => {
  expect(tokenScopePresets).toEqual([
    { id: "read", label: "Read only", scopes: agentTokenScopes.filter((scope) => scope.endsWith(":read")) },
    { id: "write", label: "Read and write", scopes: agentTokenScopes.filter((scope) => !scope.endsWith(":delete")) },
    { id: "full", label: "Full access", scopes: agentTokenScopes },
  ]);
  expect(agentDefaultScopes).toEqual(tokenScopePresets[1].scopes);
});

const ownProjects = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
  { id: "grandchild", parentId: "child" },
  { id: "sibling", parentId: null },
];

test("a listed root covers children and grandchildren but no unlisted sibling", () => {
  expect(coveredProjectIds(["root"], ownProjects)).toEqual(new Set(["root", "child", "grandchild"]));
});

test("listing a child does not cover its parent", () => {
  expect(coveredProjectIds(["child"], ownProjects)).toEqual(new Set(["child", "grandchild"]));
});

test("listed projects missing from own projects stay covered", () => {
  expect(coveredProjectIds(["shared"], ownProjects)).toEqual(new Set(["shared"]));
});

test("parent cycles terminate", () => {
  expect(coveredProjectIds(["a"], [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ])).toEqual(new Set(["a", "b", "c"]));
});
