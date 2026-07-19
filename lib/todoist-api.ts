import { parseRecurrence } from "./recurrence";
import {
  cleanTodoistProjectName,
  type TodoistCommentImport,
  type TodoistProjectImport,
  type TodoistSectionImport,
  type TodoistTaskImport,
} from "./todoist-import";

const TODOIST_SYNC_URL = "https://api.todoist.com/api/v1/sync";

type SyncProject = {
  id: string;
  parent_id?: string | null;
  name: string;
  child_order?: number;
  is_archived?: boolean;
  is_deleted?: boolean;
  inbox_project?: boolean;
};

type SyncSection = {
  id: string;
  project_id: string;
  name: string;
  section_order?: number;
  is_archived?: boolean;
  is_deleted?: boolean;
};

type SyncDue = {
  date?: string | null;
  string?: string | null;
  is_recurring?: boolean;
};

type SyncItem = {
  id: string;
  project_id: string;
  section_id?: string | null;
  parent_id?: string | null;
  content: string;
  description?: string | null;
  priority?: number;
  child_order?: number;
  checked?: boolean;
  is_deleted?: boolean;
  labels?: string[];
  due?: SyncDue | null;
  deadline?: { date?: string | null } | null;
  duration?: { amount?: number; unit?: string } | null;
};

type SyncNote = {
  item_id: string;
  content: string;
  is_deleted?: boolean;
};

type SyncProjectNote = {
  project_id: string;
  content: string;
  is_deleted?: boolean;
};

type TodoistSyncResponse = {
  projects?: SyncProject[];
  sections?: SyncSection[];
  items?: SyncItem[];
  notes?: SyncNote[];
  project_notes?: SyncProjectNote[];
};

function calendarDate(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function clockTime(value?: string | null): string | null {
  if (!value || !value.includes("T")) return null;
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

function durationMinutes(duration?: SyncItem["duration"]): number | null {
  const amount = duration?.amount;
  if (!amount || !Number.isFinite(amount) || amount <= 0) return null;
  return duration?.unit === "day" ? Math.round(amount * 24 * 60) : Math.round(amount);
}

function taskFromSync(item: SyncItem): TodoistTaskImport {
  const recurrence = item.due?.is_recurring && item.due.string
    ? parseRecurrence(item.due.string)
    : null;
  const todoistPriority = Math.min(4, Math.max(1, item.priority ?? 1));
  return {
    key: item.id,
    sectionKey: item.section_id ?? null,
    parentKey: item.parent_id ?? null,
    content: item.content.trim(),
    description: item.description?.trim() || null,
    // Todoist uses 4 for urgent while this app uses 1 for urgent.
    priority: 5 - todoistPriority,
    dueDate: calendarDate(item.due?.date),
    dueTime: clockTime(item.due?.date),
    recurrence,
    recurrenceEndDate: null,
    deadlineDate: calendarDate(item.deadline?.date),
    durationMinutes: durationMinutes(item.duration),
    labels: (item.labels ?? []).filter(Boolean),
  };
}

export function parseTodoistSync(data: TodoistSyncResponse): TodoistProjectImport[] {
  const sections = (data.sections ?? [])
    .filter((section) => !section.is_deleted && !section.is_archived)
    .sort((a, b) => (a.section_order ?? 0) - (b.section_order ?? 0));
  const items = (data.items ?? [])
    .filter((item) => !item.is_deleted && !item.checked && item.content.trim())
    .sort((a, b) => (a.child_order ?? 0) - (b.child_order ?? 0));
  const notes = (data.notes ?? []).filter((note) => !note.is_deleted && note.content.trim());
  const projectNotes = (data.project_notes ?? [])
    .filter((note) => !note.is_deleted && note.content.trim());

  return (data.projects ?? [])
    .filter((project) => !project.is_deleted && !project.is_archived)
    .sort((a, b) => (a.child_order ?? 0) - (b.child_order ?? 0))
    .map((project) => {
      const projectSections: TodoistSectionImport[] = sections
        .filter((section) => section.project_id === project.id)
        .map((section) => ({ key: section.id, name: section.name.trim() }));
      const projectTasks = items
        .filter((item) => item.project_id === project.id)
        .map(taskFromSync);
      const taskIds = new Set(projectTasks.map((task) => task.key));
      const comments: TodoistCommentImport[] = [
        ...notes
          .filter((note) => taskIds.has(note.item_id))
          .map((note) => ({ taskKey: note.item_id, content: note.content.trim() })),
        ...projectNotes
          .filter((note) => note.project_id === project.id)
          .map((note) => ({ taskKey: null, content: note.content.trim() })),
      ];
      const warnings: string[] = [];
      if (projectTasks.some((task) => task.recurrence === null && items.some(
        (item) => item.id === task.key && item.due?.is_recurring,
      ))) {
        warnings.push("One recurring rule is not supported and was imported as a one-time due date.");
      }
      return {
        sourceId: project.id,
        parentSourceId: project.parent_id ?? null,
        name: cleanTodoistProjectName(project.name),
        sections: projectSections,
        tasks: projectTasks,
        comments,
        warnings,
      };
    });
}

export async function fetchTodoistProjects(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<TodoistProjectImport[]> {
  const trimmed = token.trim();
  if (trimmed.length < 20 || trimmed.length > 512) {
    throw new Error("Enter a valid Todoist API token.");
  }
  const body = new URLSearchParams({
    sync_token: "*",
    resource_types: JSON.stringify(["projects", "sections", "items", "notes", "project_notes"]),
  });
  const response = await fetcher(TODOIST_SYNC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trimmed}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Todoist rejected this API token. Check it and try again.");
  }
  if (!response.ok) throw new Error("Todoist could not be reached. Try again in a moment.");
  return parseTodoistSync(await response.json() as TodoistSyncResponse);
}
