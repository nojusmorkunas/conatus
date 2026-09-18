export type AutoLabelRule = { contains: string; labelId: string };

// A rule is "a task whose name contains this gets that label". Case-insensitive
// substring is deliberately the whole language: no globs, no regex to debug.
export function autoLabelIds(content: string, rules: AutoLabelRule[]): string[] {
  const haystack = content.toLowerCase();
  return [
    ...new Set(
      rules
        .filter((rule) => {
          const needle = rule.contains.trim().toLowerCase();
          return needle.length > 0 && haystack.includes(needle);
        })
        .map((rule) => rule.labelId),
    ),
  ];
}
