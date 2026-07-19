// ponytail: replace leading-wildcard ILIKE search with PostgreSQL FTS (GIN + tsvector) when scale needs it.
export function escapeLike(value: string) {
  const slash = String.fromCharCode(92);
  return value.replace(/[\\\\%_]/g, slash + "$&");
}
