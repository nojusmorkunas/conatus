import { agentTokenScopes, tokenPermissionGroups } from "@/lib/token-access";
import type { TokenProject } from "@/components/api-tokens/api-tokens";

const knownScopes = new Set<string>(agentTokenScopes);

export function permissionSummary(scopes: readonly string[]) {
  const granted = new Set(scopes);
  const unknown = [...granted].filter((scope) => !knownScopes.has(scope));
  const chips = tokenPermissionGroups.flatMap((group) => {
    const actions = group.permissions
      .filter((permission) => granted.has(permission.scope))
      .map((permission) => permission.label.toLowerCase());
    return actions.length ? [`${group.label}: ${actions.join(", ")}`] : [];
  });
  return { legacy: chips.length === 0 && unknown.length > 0, chips: [...chips, ...unknown] };
}

export function joinWithAnd(items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function projectsSummary(projectIds: readonly string[] | null, projects: readonly TokenProject[]) {
  if (projectIds === null) return "All projects";
  const selected = new Set(projectIds);
  const names = projects.filter((project) => selected.has(project.id) && !project.inTrash).map((project) => project.name);
  const unavailable = selected.size - names.length;
  if (names.length === 0) return `${unavailable} unavailable ${unavailable === 1 ? "project" : "projects"}`;
  const listed = names.length > 3
    ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
    : joinWithAnd(names);
  return `Only ${listed}${unavailable ? ` and ${unavailable} unavailable` : ""}`;
}
