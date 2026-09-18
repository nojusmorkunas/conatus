// Where the app opens. Stored on the user as either one of these view keys or
// the id of a project, so a favourite project can be the landing page too.
export const startPageViews = [
  { value: "today", label: "Focus", href: "/today" },
  { value: "upcoming", label: "Upcoming", href: "/upcoming" },
  { value: "calendar", label: "Calendar", href: "/calendar" },
  { value: "inbox", label: "Inbox", href: null },
] as const;

export const startPageViewValues = startPageViews.map((view) => view.value) as [
  string,
  ...string[],
];

export const defaultStartPage = "today";

export function startPageHref(
  value: string,
  { inboxProjectId, projectIds }: { inboxProjectId: string | null; projectIds: string[] },
): string {
  const fallback = "/today";
  if (value === "inbox") {
    return inboxProjectId ? `/projects/${inboxProjectId}` : fallback;
  }
  const view = startPageViews.find((candidate) => candidate.value === value);
  if (view) return view.href ?? fallback;
  // A project chosen months ago can be deleted or unshared since. Falling back
  // beats opening the app on a 404.
  return projectIds.includes(value) ? `/projects/${value}` : fallback;
}
