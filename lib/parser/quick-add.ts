// Relative imports keep the parser usable in the browser, API, and tests.
import { firstOccurrence, parseRecurrence } from "../recurrence";
import { matchDate } from "./date-phrases";
import { cleanWord, numberValue, ordinalValue, WEEKDAY_NAMES, weekdayIndex } from "./english";
import { matchDuration, matchTime } from "./time-phrases";

export { matchDate } from "./date-phrases";

export type QuickAddParse = {
  content: string;
  projectName: string | null;
  labelNames: string[];
  priority: 1 | 2 | 3 | 4;
  dueDate: string | null;
  dueTime: string | null;
  recurrence: string | null;
  deadlineDate: string | null;
  durationMinutes: number | null;
  // Wall-clock date/time, interpreted in the device's time zone by the
  // composer, or the account's time zone by the API.
  reminderAt: string | null;
};

export type QuickAddToken = {
  kind: "project" | "label" | "priority" | "date" | "time" | "recurrence" | "deadline" | "duration" | "reminder";
  start: number;
  end: number;
  value: string;
};

type ParseOptions = {
  today: string;
  projectNames?: readonly string[];
  labelNames?: readonly string[];
};

const DAY_PARTS: Record<string, string> = { morning: "09:00", afternoon: "15:00", evening: "18:00", night: "18:00", tonight: "18:00" };

function matchDeadline(words: string[], i: number, today: string): { date: string | null; length: number } | null {
  if (words[i].startsWith("{")) {
    const end = words.findIndex((word, index) => index >= i && word.endsWith("}"));
    const length = (end < 0 ? words.length : end + 1) - i;
    const inner = words.slice(i, i + length).join(" ").slice(1, -1).trim().split(/\s+/);
    const match = end >= 0 ? matchDate(inner, 0, today) : null;
    return { date: match && match.length === inner.length ? match.date : null, length };
  }
  if (words[i] !== "deadline") return null;
  const skip = ["on", "by"].includes(words[i + 1]) ? 2 : 1;
  const match = matchDate(words, i + skip, today);
  return match ? { date: match.date, length: skip + match.length } : null;
}

// Try the whole recurrence before date matching sees any weekday within it.
// Retain incomplete or unsupported schedule phrases as text instead of
// silently saving a shorter, different schedule.
function matchRecurrence(source: string[], words: string[], i: number, today: string): { rule: string | null; length: number } | null {
  const w = words[i];
  const head = /^every!?$/.test(w);
  const alias = /^(daily|weekly|monthly|yearly|annually|fortnightly)$/.test(w);
  const inverted = (w === "the" || ordinalValue(w) !== null) && /\bof every!? month\b/.test(words.slice(i, i + 9).join(" "));
  const monthlyStart = w === "the" && ordinalValue(words[i + 1] ?? "") !== null && weekdayIndex(words[i + 2] ?? "") >= 0;
  if (!head && !alias && !inverted && !monthlyStart) return null;
  for (let length = Math.min(24, words.length - i); length >= 1; length--) {
    const phrase = source.slice(i, i + length).map((word) => /^every![.,!?;:]*$/i.test(word) ? "every!" : word.replace(/[.!?;:]+$/, "")).join(" ").replace(/,+$/, "");
    const rule = parseRecurrence(phrase);
    if (!rule) continue;
    const next = words[i + length];
    const continuation = next === "and" || next === "of" || weekdayIndex(next ?? "") >= 0 || (source[i + length - 1].endsWith(",") && next && !/^(at|for|due|deadline|p[1-4]|#|@)/.test(next) && !matchDate(words, i + length, today));
    if (!continuation) return { rule, length };
    break;
  }
  let length = 1;
  while (i + length < words.length && length < 24) {
    const next = words[i + length];
    const afterConnector = ["and", "of"].includes(words[i + length - 1]);
    const scheduleWord = /^(every!?|other|the|last|of|and|day|days|week|weeks|weekday|weekdays|weekend|month|months|year|years)$/.test(next)
      || numberValue(next) !== null || ordinalValue(next) !== null || /^\d+(st|nd|rd|th)$/.test(next)
      || next.split(",").every((part) => weekdayIndex(part) >= 0)
      || WEEKDAY_NAMES.some((day) => next.length >= 2 && day.startsWith(next));
    if (!afterConnector && !scheduleWord) break;
    length++;
  }
  return { rule: null, length };
}

function dayPart(words: string[], i: number, afterDate: boolean): { time: string; length: number; today: boolean } | null {
  if (words[i] === "tonight") return { time: DAY_PARTS.tonight, length: 1, today: !afterDate };
  if (["this", "at"].includes(words[i]) && DAY_PARTS[words[i + 1]]) {
    return { time: DAY_PARTS[words[i + 1]], length: 2, today: words[i] === "this" || !afterDate };
  }
  return afterDate && DAY_PARTS[words[i]] ? { time: DAY_PARTS[words[i]], length: 1, today: false } : null;
}

function matchReminder(words: string[], i: number, today: string): { value: string | null; length: number } | null {
  if (words[i] !== "remind" || words[i + 1] !== "me") return null;
  let cursor = i + 2;
  let date: string | null = null;
  let time: string | null = null;
  let defaultTime = false;
  for (let part = 0; part < 3; part++) {
    const dateMatch: ReturnType<typeof matchDate> = date ? null : matchDate(words, cursor, today);
    if (dateMatch) { date = dateMatch.date; cursor += dateMatch.length; continue; }
    const clock: ReturnType<typeof matchTime> = time && !defaultTime ? null : matchTime(words, cursor);
    if (clock?.time) { time = clock.time; defaultTime = false; cursor += clock.length; continue; }
    const period: ReturnType<typeof dayPart> = time ? null : dayPart(words, cursor, Boolean(date));
    if (period) { time = period.time; defaultTime = true; date ??= today; cursor += period.length; continue; }
    if (clock || words[cursor] === "at" || words[cursor] === "around") return { value: null, length: cursor - i + (clock?.length ?? Math.min(2, words.length - cursor)) };
    break;
  }
  if (!date && !time) return null;
  if (words[cursor] === "to") cursor++;
  return { value: (date ?? today) + "T" + (time ?? "09:00"), length: cursor - i };
}

export function parseQuickAdd(input: string, opts: ParseOptions): QuickAddParse {
  return parseQuickAddPreview(input, opts).parsed;
}

// One parsing pass supplies both saved fields and exact highlight ranges.
// Source tokens keep punctuation and Unicode offsets; matchers use copies.
export function parseQuickAddPreview(input: string, opts: ParseOptions): { parsed: QuickAddParse; tokens: QuickAddToken[] } {
  const matches = [...input.matchAll(/\S+/g)];
  const source = matches.map((match) => match[0]);
  const words = source.map((word) => cleanWord(word).toLowerCase());
  const consumed = new Set<number>();
  const tokens: QuickAddToken[] = [];
  const parsed: QuickAddParse = { content: "", projectName: null, labelNames: [], priority: 4, dueDate: null, dueTime: null, recurrence: null, deadlineDate: null, durationMinutes: null, reminderAt: null };

  function consume(index: number, length: number, kind: QuickAddToken["kind"], value: string) {
    for (let k = 0; k < length; k++) consumed.add(index + k);
    const last = matches[index + length - 1];
    tokens.push({ kind, start: matches[index].index, end: last.index + last[0].length, value });
  }

  function reference(index: number, names: readonly string[] | undefined) {
    if (!names) return { name: cleanWord(source[index]).slice(1), length: 1 };
    for (const name of [...names].sort((a, b) => b.length - a.length)) {
      const parts = name.split(/\s+/);
      const phrase = source.slice(index, index + parts.length).join(" ").slice(1);
      // Exact matching first preserves punctuation that belongs to a name.
      if ([phrase, cleanWord(phrase)].some((value) => value.toLowerCase() === parts.join(" ").toLowerCase())) return { name, length: parts.length };
    }
    return null;
  }

  let dateEnd = -1;
  let defaultTime = false;
  const leadingReminder = words[0] === "remind" && words[1] === "me" && words[2] === "to";
  for (let i = leadingReminder ? 3 : 0; i < words.length; i++) {
    const w = words[i];
    const deadline = matchDeadline(words, i, opts.today);
    if (deadline) {
      if (!parsed.deadlineDate && deadline.date) {
        parsed.deadlineDate = deadline.date;
        consume(i, deadline.length, "deadline", deadline.date);
      }
      i += deadline.length - 1;
      continue;
    }
    const reminder = matchReminder(words, i, opts.today);
    if (reminder) {
      if (!parsed.reminderAt && reminder.value) {
        parsed.reminderAt = reminder.value;
        consume(i, reminder.length, "reminder", reminder.value);
      }
      i += reminder.length - 1;
      continue;
    }
    if (w.length > 1 && (w[0] === "#" || w[0] === "@")) {
      const project = w[0] === "#";
      const match = reference(i, project ? opts.projectNames : opts.labelNames);
      if (match?.name) {
        if (project) parsed.projectName = match.name;
        else if (!parsed.labelNames.some((label) => label.toLowerCase() === match.name.toLowerCase())) parsed.labelNames.push(match.name);
        consume(i, match.length, project ? "project" : "label", match.name);
        i += match.length - 1;
      }
      continue;
    }
    const priority = /^p([1-4])$/.exec(w);
    if (priority) {
      parsed.priority = Number(priority[1]) as 1 | 2 | 3 | 4;
      consume(i, 1, "priority", priority[1]);
      continue;
    }
    const duration = matchDuration(words, i);
    if (duration) {
      if (!parsed.durationMinutes && duration.minutes) {
        parsed.durationMinutes = duration.minutes;
        consume(i, duration.length, "duration", String(duration.minutes));
      }
      i += duration.length - 1;
      continue;
    }
    // A half-typed decimal duration must not fall through as a D.M date.
    if (w === "for" && numberValue(words[i + 1] ?? "") !== null) {
      i++;
      continue;
    }
    if (w === "around") {
      // Fuzzy times need an AM/PM decision; don't extract a bare time inside.
      const clock = matchTime(words, i + 1);
      if (clock || numberValue(words[i + 1] ?? "") !== null) i += clock?.length ?? 1;
      continue;
    }
    const repeat = matchRecurrence(source, words, i, opts.today);
    if (repeat) {
      if (!parsed.dueDate && repeat.rule) {
        parsed.recurrence = repeat.rule;
        parsed.dueDate = firstOccurrence(repeat.rule, opts.today);
        consume(i, repeat.length, "recurrence", repeat.rule);
        dateEnd = i + repeat.length;
      }
      i += repeat.length - 1;
      continue;
    }
    const clock = matchTime(words, i);
    if (clock) {
      if ((!parsed.dueTime || defaultTime) && clock.time) {
        parsed.dueTime = clock.time;
        defaultTime = false;
        consume(i, clock.length, "time", clock.time);
      }
      i += clock.length - 1;
      continue;
    }
    if (w === "at" && numberValue(words[i + 1] ?? "") !== null) { i++; continue; }
    const period = dayPart(words, i, dateEnd === i);
    if (period && (!parsed.dueTime || defaultTime) && (!period.today || !parsed.dueDate)) {
      if (period.today) parsed.dueDate = opts.today;
      parsed.dueTime = period.time;
      defaultTime = true;
      consume(i, period.length, period.today ? "date" : "time", period.today ? opts.today : period.time);
      i += period.length - 1;
      continue;
    }
    if (!parsed.dueDate) {
      const skip = w === "due" ? (words[i + 1] === "by" ? 2 : 1) : w === "by" ? 1 : 0;
      const match = matchDate(words, i + skip, opts.today);
      if (match) {
        parsed.dueDate = match.date;
        consume(i, skip + match.length, "date", match.date);
        dateEnd = i + skip + match.length;
        i += skip + match.length - 1;
      }
    }
  }

  if (leadingReminder && (parsed.dueDate || parsed.dueTime) && !parsed.recurrence) {
    parsed.reminderAt = (parsed.dueDate ?? opts.today) + "T" + (parsed.dueTime ?? "09:00");
    for (const token of tokens) if (token.kind === "date" || token.kind === "time") { token.kind = "reminder"; token.value = parsed.reminderAt; }
    consume(0, 3, "reminder", parsed.reminderAt);
    parsed.dueDate = null;
    parsed.dueTime = null;
  }
  if (parsed.dueTime && !parsed.dueDate) parsed.dueDate = opts.today;
  parsed.content = source.filter((_, i) => !consumed.has(i)).join(" ");
  if (!parsed.content) {
    return { parsed: { content: source.join(" "), projectName: null, labelNames: [], priority: 4, dueDate: null, dueTime: null, recurrence: null, deadlineDate: null, durationMinutes: null, reminderAt: null }, tokens: [] };
  }
  return { parsed, tokens: tokens.sort((a, b) => a.start - b.start) };
}

export function removeQuickAddTokens(input: string, tokens: QuickAddToken[]): string {
  let result = input;
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) result = result.slice(0, token.start) + result.slice(token.end);
  return result.replace(/\s+/g, " ").trim();
}
