// Relative import: vitest has no "@/" alias configured.
import { firstOccurrence, parseRecurrence } from "../recurrence";

export type QuickAddParse = {
  content: string;
  projectName: string | null;
  labelNames: string[];
  priority: 1 | 2 | 3 | 4;
  dueDate: string | null; // 'YYYY-MM-DD'
  dueTime: string | null; // 'HH:mm', only set when dueDate is set
  recurrence: string | null; // canonical rule from parseRecurrence
  deadlineDate: string | null; // 'YYYY-MM-DD', from a {date phrase} token
  durationMinutes: number | null; // from a "for <duration>" token
};

export type QuickAddToken = {
  kind: "project" | "label" | "priority" | "date" | "time" | "recurrence" | "deadline" | "duration";
  start: number;
  end: number;
  value: string;
};

type ParseOptions = {
  today: string;
  // The composer only consumes references it can actually apply. Omit these
  // lists to retain the API parser's context-free behavior.
  projectNames?: readonly string[];
  labelNames?: readonly string[];
};

const DAY = 86_400_000;

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3,
  wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const ms = toUtc(date) + n * DAY;
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? format(ms) : "";
}

function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

function validDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? format(d.getTime())
    : null;
}

// Matches a date phrase starting at words[i]; returns the resolved date and
// how many words it consumed. Also used by lib/filter for before:/after: phrases.
export function matchDate(words: string[], i: number, today: string): { date: string; length: number } | null {
  const w = words[i].toLowerCase();
  if (w === "today" || w === "tod") return { date: today, length: 1 };
  if (w === "tomorrow" || w === "tmr") return { date: addDays(today, 1), length: 1 };
  if (w in WEEKDAYS) {
    const diff = (WEEKDAYS[w] - weekday(today) + 7) % 7 || 7;
    return { date: addDays(today, diff), length: 1 };
  }
  if (w === "next" && i + 1 < words.length) {
    const next = words[i + 1].toLowerCase();
    const nextMonday = addDays(today, 7 - ((weekday(today) + 6) % 7));
    if (next === "week") return { date: nextMonday, length: 2 };
    if (next in WEEKDAYS) return { date: addDays(nextMonday, (WEEKDAYS[next] + 6) % 7), length: 2 };
  }
  if (w === "in" && i + 2 < words.length && /^\d+$/.test(words[i + 1]) && /^days?$/i.test(words[i + 2])) {
    const date = addDays(today, Number(words[i + 1]));
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, length: 3 } : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (iso) {
    const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { date, length: 1 } : null;
  }
  const dm = /^(\d{1,2})[/.](\d{1,2})$/.exec(w);
  if (dm) {
    const year = Number(today.slice(0, 4));
    const thisYear = validDate(year, Number(dm[2]), Number(dm[1]));
    if (thisYear && thisYear >= today) return { date: thisYear, length: 1 };
    const nextYear = validDate(year + 1, Number(dm[2]), Number(dm[1]));
    return nextYear ? { date: nextYear, length: 1 } : null;
  }
  return null;
}

// "{date phrase}" deadline token starting at words[i], e.g. "{friday}" or
// "{next week}". The phrase inside braces reuses matchDate verbatim, so it
// supports whatever matchDate supports (today, weekdays, next X, ISO, D/M).
// Unparseable or unterminated braces are left alone (stay in content).
function matchDeadline(words: string[], i: number, today: string): { date: string; length: number } | null {
  if (!words[i].startsWith("{")) return null;
  for (const length of [3, 2, 1]) {
    if (i + length > words.length) continue;
    const last = words[i + length - 1];
    if (!last.endsWith("}")) continue;
    const inner = words
      .slice(i, i + length)
      .join(" ")
      .slice(1, -1)
      .split(/\s+/)
      .filter(Boolean);
    if (inner.length !== length) continue; // braces must hug the phrase exactly
    const match = matchDate(inner, 0, today);
    if (match && match.length === length) return { date: match.date, length };
  }
  return null;
}

// "every ..." phrase starting at words[i]; longest match wins so
// "every 2 weeks" isn't cut short at "every 2".
function matchRecurrence(words: string[], i: number): { rule: string; length: number } | null {
  for (const length of [3, 2]) {
    if (i + length > words.length) continue;
    const rule = parseRecurrence(words.slice(i, i + length).join(" "));
    if (rule) return { rule, length };
  }
  return null;
}

// 'HH:mm', 'H', 'Hpm', 'H:MMam' → 'HH:mm', or null if not a time.
function matchTime(word: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(word.toLowerCase());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    if (m[3] === "pm" && hour !== 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "for <duration>" starting at words[i], e.g. "for 2h", "for 90m", "for
// 1h30m". Requires the "for" prefix because a bare "2h" is ambiguous with matchTime
// (24h-style hour tokens like "23" or combined with "at") so it's not treated
// as a duration on its own.
function matchDuration(words: string[], i: number): { minutes: number; length: number } | null {
  if (words[i].toLowerCase() !== "for" || i + 1 >= words.length) return null;
  const m = /^(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/i.exec(
    words[i + 1],
  );
  if (!m || (!m[1] && !m[2])) return null;
  const minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return minutes > 0 && minutes <= 1440 ? { minutes, length: 2 } : null;
}

export function parseQuickAdd(input: string, opts: { today: string }): QuickAddParse {
  const { parsed } = parseQuickAddPreview(input, opts);
  return parsed;
}

// One parsing pass supplies both the saved fields and the exact source ranges
// to highlight. Matching against original offsets keeps repeated words,
// Unicode, multiple spaces, and mid-sentence edits aligned with the textarea.
export function parseQuickAddPreview(input: string, opts: ParseOptions): {
  parsed: QuickAddParse;
  tokens: QuickAddToken[];
} {
  const matches = [...input.matchAll(/\S+/g)];
  const words = matches.map((match) => match[0]);
  const consumed = new Set<number>();
  const tokens: QuickAddToken[] = [];

  function consume(index: number, length: number, kind: QuickAddToken["kind"], value: string) {
    for (let k = 0; k < length; k++) consumed.add(index + k);
    const last = matches[index + length - 1];
    tokens.push({ kind, start: matches[index].index, end: last.index + last[0].length, value });
  }

  function reference(index: number, names: readonly string[] | undefined) {
    if (!names) return { name: words[index].slice(1), length: 1 };
    // Longest existing name wins: #Home office should not become #Home.
    for (const name of [...names].sort((a, b) => b.length - a.length)) {
      const parts = name.split(/\s+/);
      const phrase = words.slice(index, index + parts.length).join(" ").slice(1);
      if (phrase.toLowerCase() === parts.join(" ").toLowerCase()) {
        return { name, length: parts.length };
      }
    }
    return null;
  }
  let projectName: string | null = null;
  const labelNames: string[] = [];
  let priority: 1 | 2 | 3 | 4 = 4;
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  let recurrence: string | null = null;
  let deadlineDate: string | null = null;
  let durationMinutes: number | null = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!deadlineDate && w.startsWith("{")) {
      const match = matchDeadline(words, i, opts.today);
      if (match) {
        deadlineDate = match.date;
        consume(i, match.length, "deadline", match.date);
        i += match.length - 1;
        continue;
      }
    }
    if (w.length > 1 && w[0] === "#") {
      const match = reference(i, opts.projectNames);
      if (match) {
        projectName = match.name; // last one wins
        consume(i, match.length, "project", match.name);
        i += match.length - 1;
      }
      continue;
    }
    if (w.length > 1 && w[0] === "@") {
      const match = reference(i, opts.labelNames);
      if (match) {
        if (!labelNames.includes(match.name)) labelNames.push(match.name);
        consume(i, match.length, "label", match.name);
        i += match.length - 1;
      }
      continue;
    }
    const p = /^p([1-4])$/i.exec(w);
    if (p) {
      priority = Number(p[1]) as 1 | 2 | 3 | 4;
      consume(i, 1, "priority", p[1]);
      continue;
    }
    if (!dueDate && (w.toLowerCase() === "every" || w.toLowerCase() === "every!")) {
      const match = matchRecurrence(words, i);
      if (match) {
        recurrence = match.rule;
        dueDate = firstOccurrence(match.rule, opts.today);
        consume(i, match.length, "recurrence", match.rule);
        i += match.length - 1;
        continue;
      }
    }
    if (!dueDate) {
      const match = matchDate(words, i, opts.today);
      if (match) {
        dueDate = match.date;
        consume(i, match.length, "date", match.date);
        i += match.length - 1;
        continue;
      }
    }
    if (!dueTime && w.toLowerCase() === "at" && i + 1 < words.length) {
      const time = matchTime(words[i + 1]);
      if (time) {
        dueTime = time;
        consume(i, 2, "time", time);
        i++;
      }
    }
    if (!durationMinutes && w.toLowerCase() === "for") {
      const match = matchDuration(words, i);
      if (match) {
        durationMinutes = match.minutes;
        consume(i, 2, "duration", String(match.minutes));
        i++;
      }
    }
  }

  if (dueTime && !dueDate) dueDate = opts.today; // time alone means today

  const content = words.filter((_, i) => !consumed.has(i)).join(" ");
  if (!content) {
    // A task needs content; if tokens ate everything, treat it all as content.
    return { parsed: { content: words.join(" "), projectName: null, labelNames: [], priority: 4, dueDate: null, dueTime: null, recurrence: null, deadlineDate: null, durationMinutes: null }, tokens: [] };
  }
  return { parsed: { content, projectName, labelNames, priority, dueDate, dueTime, recurrence, deadlineDate, durationMinutes }, tokens };
}

export function removeQuickAddTokens(input: string, tokens: QuickAddToken[]): string {
  let result = input;
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, token.start) + result.slice(token.end);
  }
  return result.replace(/\s+/g, " ").trim();
}
