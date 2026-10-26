export const agentTokenScopes = [
  "tasks:read",
  "tasks:write",
  "tasks:delete",
  "projects:read",
  "projects:write",
  "projects:delete",
  "projects:share",
  "labels:read",
  "labels:write",
  "labels:delete",
  "filters:read",
  "filters:write",
  "filters:delete",
  "comments:read",
  "comments:write",
  "comments:delete",
  "reminders:read",
  "reminders:write",
  "reminders:delete",
  "settings:write",
] as const;

export type AgentTokenScope = (typeof agentTokenScopes)[number];

export const agentDefaultScopes = agentTokenScopes.filter(
  (scope) => !scope.endsWith(":delete"),
);

export const tokenPermissionGroups = [
  {
    label: "Tasks",
    permissions: [
      { scope: "tasks:read", label: "Read", description: "See and search tasks, including completed ones and ones in Trash, and download their attachments. Also reads your name, username, time zone and Inbox, which the MCP server relies on." },
      { scope: "tasks:write", label: "Write", description: "Add, edit, complete, reopen, reorder and move tasks, set their labels, attach files and restore them from Trash." },
      { scope: "tasks:delete", label: "Delete", description: "Move tasks to Trash, together with their subtasks, and delete attachments permanently." },
    ],
  },
  {
    label: "Projects and sections",
    permissions: [
      { scope: "projects:read", label: "Read", description: "See projects, their sections and who they're shared with." },
      { scope: "projects:write", label: "Write", description: "Create, rename, archive, reorder and move projects and sections, and restore projects from Trash. Moving or duplicating a section moves or copies its tasks too." },
      { scope: "projects:delete", label: "Delete", description: "Move projects to Trash, together with their sub-projects, and delete sections. Deleting a section also deletes its tasks permanently." },
      { scope: "projects:share", label: "Share", description: "Invite people to projects you own, remove them and leave projects shared with you." },
    ],
  },
  {
    label: "Labels",
    permissions: [
      { scope: "labels:read", label: "Read", description: "See your labels." },
      { scope: "labels:write", label: "Write", description: "Create, rename, recolor and favorite labels." },
      { scope: "labels:delete", label: "Delete", description: "Delete labels, which removes them from every task." },
    ],
  },
  {
    label: "Saved filters",
    permissions: [
      { scope: "filters:read", label: "Read", description: "See your saved filters." },
      { scope: "filters:write", label: "Write", description: "Create, rename and change saved filters." },
      { scope: "filters:delete", label: "Delete", description: "Delete saved filters." },
    ],
  },
  {
    label: "Comments",
    permissions: [
      { scope: "comments:read", label: "Read", description: "Read comments on tasks and projects." },
      { scope: "comments:write", label: "Write", description: "Add comments and edit your own." },
      { scope: "comments:delete", label: "Delete", description: "Delete your own comments permanently." },
    ],
  },
  {
    label: "Reminders",
    permissions: [
      { scope: "reminders:read", label: "Read", description: "See your reminders." },
      { scope: "reminders:write", label: "Write", description: "Add reminders and mark them as seen. Quick add needs this when the text asks for a reminder." },
      { scope: "reminders:delete", label: "Delete", description: "Delete reminders permanently." },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { scope: "settings:write", label: "Write", description: "Change your name, time zone, date format, first day of the week, daily goal, start page and email reminders." },
    ],
  },
] as const satisfies readonly {
  label: string;
  permissions: readonly { scope: AgentTokenScope; label: string; description: string }[];
}[];

export const tokenScopePresets = [
  { id: "read", label: "Read only", scopes: agentTokenScopes.filter((scope) => scope.endsWith(":read")) },
  { id: "write", label: "Read and write", scopes: agentDefaultScopes },
  { id: "full", label: "Full access", scopes: agentTokenScopes },
] as const;

// A token limited to some projects also reaches the user's own sub-projects
// nested under them, at any depth. Shared projects are never pulled in
// through a parent: a collaborator sees them as separate top-level projects,
// so each one has to be listed.
export function coveredProjectIds(
  listed: readonly string[],
  ownProjects: readonly { id: string; parentId: string | null }[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const project of ownProjects) {
    if (project.parentId === null) continue;
    const siblings = children.get(project.parentId) ?? [];
    siblings.push(project.id);
    children.set(project.parentId, siblings);
  }
  const covered = new Set(listed);
  const queue = [...covered];
  for (let index = 0; index < queue.length; index++) {
    for (const childId of children.get(queue[index]) ?? []) {
      if (covered.has(childId)) continue;
      covered.add(childId);
      queue.push(childId);
    }
  }
  return covered;
}
