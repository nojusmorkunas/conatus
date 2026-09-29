// ponytail: replace leading-wildcard ILIKE search with PostgreSQL FTS (GIN + tsvector) when scale needs it.
export function escapeLike(value: string) {
  const slash = String.fromCharCode(92);
  return value.replace(/[\\\\%_]/g, slash + "$&");
}

export type SearchStatus = "all" | "open" | "completed";

// Anything unrecognised, including a project the user can't access, falls
// back to searching everything rather than erroring.
export function searchFilters(
  params: { project?: string | string[]; status?: string | string[] },
  projectIds: string[],
): { project: string | null; status: SearchStatus } {
  const project =
    typeof params.project === "string" && projectIds.includes(params.project)
      ? params.project
      : null;
  const status =
    params.status === "open" || params.status === "completed" ? params.status : "all";
  return { project, status };
}
