import { parseRecurrence } from "./recurrence";

export const TODOIST_CSV_COLUMNS = [
  "TYPE",
  "CONTENT",
  "DESCRIPTION",
  "IS_COLLAPSED",
  "PRIORITY",
  "INDENT",
  "AUTHOR",
  "RESPONSIBLE",
  "DATE",
  "DATE_LANG",
  "TIMEZONE",
  "DURATION",
  "DURATION_UNIT",
  "DEADLINE",
  "DEADLINE_LANG",
] as const;

type TodoistCsvColumn = (typeof TODOIST_CSV_COLUMNS)[number];
type CsvRow = Record<TodoistCsvColumn, string>;

export type TodoistSectionImport = {
  key: string;
  name: string;
};

export type TodoistTaskImport = {
  key: string;
  sectionKey: string | null;
  parentKey: string | null;
  content: string;
  description: string | null;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  deadlineDate: string | null;
  durationMinutes: number | null;
  labels: string[];
};

export type TodoistCommentImport = {
  taskKey: string | null;
  content: string;
};

export type TodoistProjectImport = {
  sourceId: string;
  parentSourceId: string | null;
  name: string;
  sections: TodoistSectionImport[];
  tasks: TodoistTaskImport[];
  comments: TodoistCommentImport[];
  warnings: string[];
};

export type TodoistProjectPreview = {
  id: string;
  name: string;
  sections: number;
  tasks: number;
  subtasks: number;
  comments: number;
  warnings: string[];
  recurringDatesNeedingReview: Array<{
    taskId: string;
    content: string;
    recurrence: string;
  }>;
  nameConflict: boolean;
};

/**
 * Todoist backup filenames sometimes append the opaque project id to the
 * visible name (for example `Personal [6g8WPqw25HQhcQgV]`). The id is not
 * meaningful after import, so keep only the name the person chose.
 */
export function cleanTodoistProjectName(name: string): string {
  const cleaned = name.trim().replace(/\s+\[[A-Za-z0-9_-]{8,}\]$/, "").trim();
  return cleaned || "Untitled Todoist project";
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"' && value.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (quoted) throw new Error("The CSV contains an unterminated quoted value.");
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function parseTodoistRows(text: string): CsvRow[] {
  const rawRows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const header = rawRows.shift();
  if (!header) throw new Error("The CSV is empty.");

  const missing = TODOIST_CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`This is not a Todoist CSV (missing ${missing.join(", ")}).`);
  }

  const indexes = new Map(header.map((column, index) => [column, index]));
  return rawRows.map((values) =>
    Object.fromEntries(
      TODOIST_CSV_COLUMNS.map((column) => [column, values[indexes.get(column)!] ?? ""]),
    ) as CsvRow,
  );
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseCalendarDate(value: string, referenceDate: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const ordinal = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(trimmed);
  if (ordinal) {
    const [year, month] = referenceDate.split("-").map(Number);
    return validDate(year, month, Number(ordinal[1]));
  }

  const named = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(trimmed);
  if (named && MONTHS[named[1]]) {
    const year = named[3] ? Number(named[3]) : Number(referenceDate.slice(0, 4));
    return validDate(year, MONTHS[named[1]], Number(named[2]));
  }
  return null;
}

function parseTodoistSchedule(
  value: string,
  referenceDate: string,
): {
  dueDate: string | null;
  dueTime: string | null;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  warning: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) return { dueDate: null, dueTime: null, recurrence: null, recurrenceEndDate: null, warning: null };

  if (/^every!?\b/i.test(trimmed)) {
    const clause = /\s+(starting|ending)\s+/i.exec(trimmed);
    const ruleText = (clause ? trimmed.slice(0, clause.index) : trimmed).trim();
    const rule = parseRecurrence(ruleText);
    if (!rule) {
      return {
        dueDate: null,
        dueTime: null,
        recurrence: null,
        recurrenceEndDate: null,
        warning: "One recurring date could not be understood and was left unset.",
      };
    }

    // Todoist CSV backups preserve the natural-language recurrence rule but
    // can omit the current concrete occurrence. Never invent that date: an
    // overdue task and a completed-up-to-date task have the same CSV value.
    let dueDate: string | null = null;
    let recurrenceEndDate: string | null = null;
    let warning: string | null =
      "Todoist did not include the current occurrence for one or more recurring tasks; enter the date shown in Todoist before importing.";
    if (clause?.[1].toLowerCase() === "starting") {
      const after = trimmed.slice(clause.index! + clause[0].length);
      const endingIndex = after.toLowerCase().indexOf(" ending ");
      const startText = endingIndex >= 0 ? after.slice(0, endingIndex) : after;
      const startDate = parseCalendarDate(startText, referenceDate);
      // A start strictly after the backup date is still the current upcoming
      // occurrence. A start on or before the backup date may already have
      // advanced, so it must be reviewed too.
      if (startDate && startDate > referenceDate) {
        dueDate = startDate;
        warning = null;
      } else if (!startDate) {
        warning = "A recurring start date could not be understood; enter the date shown in Todoist before importing.";
      }
    }
    const ending = /\s+ending\s+/i.exec(trimmed);
    if (ending) {
      recurrenceEndDate = parseCalendarDate(
        trimmed.slice(ending.index + ending[0].length),
        referenceDate,
      );
      if (!recurrenceEndDate) {
        warning = "A recurring end date could not be understood and was left unset.";
      }
    }
    return { dueDate, dueTime: null, recurrence: rule, recurrenceEndDate, warning };
  }

  const dateAndTime = /^(.+?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(trimmed);
  const dateText = dateAndTime?.[1] ?? trimmed;
  const dueDate = parseCalendarDate(dateText, referenceDate);
  let dueTime: string | null = null;
  if (dueDate && dateAndTime) {
    let hour = Number(dateAndTime[2]);
    const minutes = Number(dateAndTime[3] ?? 0);
    const meridiem = dateAndTime[4].toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour <= 23 && minutes <= 59) {
      dueTime = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return {
    dueDate,
    dueTime,
    recurrence: null,
    recurrenceEndDate: null,
    warning: dueDate ? null : "One due date could not be understood and was left unset.",
  };
}

function parseDuration(value: string, unit: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const normalized = unit.trim().toLowerCase();
  if (/^min/.test(normalized)) return Math.round(amount);
  if (/^hour|^hr/.test(normalized)) return Math.round(amount * 60);
  if (/^day/.test(normalized)) return Math.round(amount * 24 * 60);
  return null;
}

function addWarning(warnings: string[], warning: string | null) {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

export function parseTodoistCsv(
  text: string,
  options: { sourceId: string; projectName: string; referenceDate: string },
): TodoistProjectImport {
  const rows = parseTodoistRows(text);
  const sections: TodoistSectionImport[] = [];
  const tasks: TodoistTaskImport[] = [];
  const comments: TodoistCommentImport[] = [];
  const warnings: string[] = [];
  const taskAtIndent = new Map<number, string>();
  let currentSectionKey: string | null = null;
  let lastTaskKey: string | null = null;

  rows.forEach((row, index) => {
    const type = row.TYPE.trim().toLowerCase();
    if (!type || type === "meta") return;

    if (type === "section") {
      const name = row.CONTENT.trim();
      if (!name) {
        addWarning(warnings, "One unnamed section was skipped.");
        return;
      }
      currentSectionKey = `section-${index}`;
      sections.push({ key: currentSectionKey, name });
      taskAtIndent.clear();
      lastTaskKey = null;
      if (row.DESCRIPTION.trim()) {
        comments.push({
          taskKey: null,
          content: `Section note — ${name}\n\n${row.DESCRIPTION.trim()}`,
        });
      }
      return;
    }

    if (type === "task") {
      const content = row.CONTENT.trim();
      if (!content) {
        addWarning(warnings, "One task without a title was skipped.");
        return;
      }
      const indent = Math.max(1, Number.parseInt(row.INDENT, 10) || 1);
      const parentKey = indent > 1 ? taskAtIndent.get(indent - 1) ?? null : null;
      if (indent > 1 && !parentKey) {
        addWarning(warnings, "One subtask had no matching parent and was imported at the top level.");
      }
      for (const level of [...taskAtIndent.keys()]) {
        if (level >= indent) taskAtIndent.delete(level);
      }

      const schedule = parseTodoistSchedule(row.DATE, options.referenceDate);
      addWarning(warnings, schedule.warning);
      const deadlineDate = row.DEADLINE.trim()
        ? parseCalendarDate(row.DEADLINE, options.referenceDate)
        : null;
      if (row.DEADLINE.trim() && !deadlineDate) {
        addWarning(warnings, "One deadline could not be understood and was left unset.");
      }
      const durationMinutes = parseDuration(row.DURATION, row.DURATION_UNIT);
      if (row.DURATION.trim() && !durationMinutes) {
        addWarning(warnings, "One duration could not be understood and was left unset.");
      }

      const key = `task-${index}`;
      const priorityValue = Number.parseInt(row.PRIORITY, 10);
      tasks.push({
        key,
        sectionKey: currentSectionKey,
        parentKey,
        content,
        description: row.DESCRIPTION.trim() || null,
        priority: priorityValue >= 1 && priorityValue <= 4 ? priorityValue : 4,
        dueDate: schedule.dueDate,
        dueTime: schedule.dueTime,
        recurrence: schedule.recurrence,
        recurrenceEndDate: schedule.recurrenceEndDate,
        deadlineDate,
        durationMinutes,
        labels: [],
      });
      taskAtIndent.set(indent, key);
      lastTaskKey = key;
      return;
    }

    if (type === "note") {
      if (row.CONTENT.trim() && lastTaskKey) {
        comments.push({ taskKey: lastTaskKey, content: row.CONTENT.trim() });
      } else if (row.CONTENT.trim()) {
        comments.push({ taskKey: null, content: row.CONTENT.trim() });
        addWarning(warnings, "A task note had no matching task and was saved as a project comment.");
      }
      return;
    }

    if (type === "project_note") {
      if (row.CONTENT.trim()) comments.push({ taskKey: null, content: row.CONTENT.trim() });
      return;
    }

    addWarning(warnings, `Rows of type “${type}” are not supported and were skipped.`);
  });

  return {
    sourceId: options.sourceId,
    parentSourceId: null,
    name: cleanTodoistProjectName(options.projectName),
    sections,
    tasks,
    comments,
    warnings,
  };
}

export function summarizeTodoistProject(
  project: TodoistProjectImport,
  existingProjectNames: Set<string>,
): TodoistProjectPreview {
  return {
    id: project.sourceId,
    name: project.name,
    sections: project.sections.length,
    tasks: project.tasks.length,
    subtasks: project.tasks.filter((task) => task.parentKey !== null).length,
    comments: project.comments.length,
    warnings: project.warnings,
    recurringDatesNeedingReview: project.tasks
      .filter((task) => task.recurrence !== null && task.dueDate === null)
      .map((task) => ({
        taskId: task.key,
        content: task.content,
        recurrence: task.recurrence!,
      })),
    nameConflict: existingProjectNames.has(project.name.toLowerCase()),
  };
}
