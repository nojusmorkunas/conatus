import { numberValue, ordinal, ordinalValue, WEEKDAY_NAMES, weekdayIndex } from "../parser/english";

export { ordinal } from "../parser/english";

const ALIASES: Record<string, string> = {
  daily: "day", weekly: "week", monthly: "month", yearly: "year", annually: "year", fortnightly: "2 weeks",
};

function monthlyAnchor(text: string): string | null {
  const words = text.replace(/^the /, "").split(" ");
  const day = weekdayIndex(words.at(-1) ?? "");
  if (day >= 0) {
    const position = words.slice(0, -1).join(" ");
    if (position === "last") return `last ${WEEKDAY_NAMES[day]}`;
    const nth = ordinalValue(position);
    return nth && nth <= 5 ? `${ordinal(nth)} ${WEEKDAY_NAMES[day]}` : null;
  }
  if (/^last days?$/.test(text)) return "last day";
  const nth = ordinalValue(text.replace(/^the /, ""));
  return nth ? ordinal(nth) : null;
}

// Rule body after the "every"/"every!" head → canonical body, else null.
// Bodies include intervals, weekday lists, monthly days, and monthly weekdays.
function parseRuleBody(words: string[]): string | null {
  const text = words.join(" ").replace(/^the /, "").replace(/ of (?:the )?month$/, "");
  // A bare "second" can be a time unit; it isn't enough to infer the 2nd
  // day of a month. "second Friday" and "second of every month" are clear.
  const anchored = text === "second" ? null : monthlyAnchor(text);
  if (anchored) return anchored;

  // A list is one rule: never silently keep its first weekday. Canonical
  // lists are unique, in Monday-first order, and round-trip through imports.
  if (text.includes(",") || /\band\b/.test(text)) {
    const parts = text.split(/\s*,\s*(?:and\s+)?|\s+and\s+/);
    const days = parts.map(weekdayIndex);
    if (days.length < 2 || days.some((day) => day < 0)) return null;
    return [...new Set(days)].sort((a, b) => (a + 6) % 7 - (b + 6) % 7).map((day) => WEEKDAY_NAMES[day]).join(", ");
  }
  if (words.length === 1) {
    const day = weekdayIndex(words[0]);
    if (day >= 0) return WEEKDAY_NAMES[day];
    if (/^weekdays?$/.test(words[0])) return "weekday";
    if (/^weekends?$/.test(words[0])) return "saturday, sunday";
    if (words[0] === "fortnight") return "2 weeks";
    const unit = /^(day|week|month|year)s?$/.exec(words[0]);
    return unit ? unit[1] : null;
  }

  if (words.length === 2) {
    if (words[0] === "other") {
      const day = weekdayIndex(words[1]);
      if (day >= 0) return `other ${WEEKDAY_NAMES[day]}`;
      const unit = /^(day|week|month|year)s?$/.exec(words[1]);
      return unit ? `2 ${unit[1]}s` : null;
    }
  }

  const unit = /^(day|week|month|year)s?$/.exec(words.at(-1) ?? "");
  const n = numberValue(words.slice(0, -1).join(" "));
  if (unit && n !== null && Number.isInteger(n) && n >= 1 && n <= 999) return n === 1 ? unit[1] : `${n} ${unit[1]}s`;

  return null;
}

// "every <body>" or "every! <body>" → canonical rule, else null.
// "every!" is Todoist's completion-relative marker: the schedule restarts
// from the completion day instead of stepping from the old due date.
// Canonical strings round-trip: parseRecurrence(canonical) === canonical.
export function parseRecurrence(text: string): string | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?;:]+$/, "").replace(/\s+/g, " ");
  if (ALIASES[normalized]) return `every ${ALIASES[normalized]}`;
  // "the first Friday of every month" and "1st of every month" retain
  // their monthly anchor instead of becoming a floating month interval.
  const inverted = /^(?:the )?(.+?) of (every!?) month$/.exec(normalized);
  if (inverted) {
    const anchor = monthlyAnchor(inverted[1]);
    return anchor ? `${inverted[2]} ${anchor}` : null;
  }
  const onMonth = /^(every!?) month on (?:the )?(.+)$/.exec(normalized);
  if (onMonth) {
    const anchor = monthlyAnchor(onMonth[2]);
    return anchor ? `${onMonth[1]} ${anchor}` : null;
  }
  const [head, ...rest] = normalized.split(" ");
  if ((head !== "every" && head !== "every!") || rest.length === 0) return null;
  const body = parseRuleBody(rest);
  return body === null ? null : `${head} ${body}`;
}

// DST stance: all recurrence math is calendar-date arithmetic on
// 'YYYY-MM-DD' strings via Date.UTC. A due *time* is stored separately and
// never shifted by this module, so DST transitions cannot skew occurrences
// by construction, so no timezone database is needed.
function addDays(date: string, n: number): string {
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + n);
  return utc.toISOString().slice(0, 10);
}

function addMonths(date: string, n: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = year * 12 + (month - 1) + n;
  const lastDay = new Date(Date.UTC(Math.floor(target / 12), (target % 12) + 1, 0));
  return new Date(
    Date.UTC(Math.floor(target / 12), target % 12, Math.min(day, lastDay.getUTCDate())),
  )
    .toISOString()
    .slice(0, 10);
}

function utcWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Next due date: strictly after `from`, and never in the past. Overdue tasks
// catch up to the next future occurrence instead of replaying stale dates.
// Month/year steps always count from `from` so a clamped Feb 28 doesn't
// permanently drift the anchor off the 31st.
//
// "every!" rules anchor on `today` (the completion day) instead of the old
// due date: "every! 3 days" → today + 3. The existing signature already
// carries `today`, so callers need no change to get every! semantics.
export function nextOccurrence(rule: string, from: string, today: string): string {
  const canonical = parseRecurrence(rule);
  if (!canonical) throw new Error(`Unsupported recurrence: ${rule}`);
  const words = canonical.split(" ");
  if (words[0] === "every!") from = today;
  const floor = from > today ? from : today;

  const monthlyWeekday = /^(last|[1-5](?:st|nd|rd|th)) (\w+)$/.exec(words.slice(1).join(" "));
  const monthlyDay = monthlyWeekday && weekdayIndex(monthlyWeekday[2]);
  if (monthlyWeekday && monthlyDay !== null && monthlyDay >= 0) {
    const [year, month] = floor.split("-").map(Number);
    for (let offset = 0; offset < 24; offset++) {
      const total = year * 12 + month - 1 + offset;
      const y = Math.floor(total / 12);
      const m = total % 12;
      const last = new Date(Date.UTC(y, m + 1, 0));
      const wanted = monthlyWeekday[1] === "last"
        ? last.getUTCDate() - (last.getUTCDay() - monthlyDay + 7) % 7
        : 1 + (monthlyDay - new Date(Date.UTC(y, m, 1)).getUTCDay() + 7) % 7 + (parseInt(monthlyWeekday[1]) - 1) * 7;
      // A fifth weekday skips months where it doesn't exist.
      if (wanted > last.getUTCDate()) continue;
      const date = new Date(Date.UTC(y, m, wanted)).toISOString().slice(0, 10);
      if (date > floor) return date;
    }
    throw new Error(`Could not advance monthly weekday: ${rule}`);
  }

  if (canonical.includes(",")) {
    const days = canonical.replace(/^every!? /, "").split(", ").map(weekdayIndex);
    const diff = Math.min(...days.map((day) => (day - utcWeekday(floor) + 7) % 7 || 7));
    return addDays(floor, diff);
  }

  // "other <weekday>": fortnightly, anchor-preserving. The anchor is `from`
  // itself when it falls on the weekday, else the first such weekday after
  // it; occurrences are anchor + 14k. A long-overdue task catches up to the
  // next occurrence that keeps the original fortnight parity. It does not
  // reset to "next <weekday> after today".
  if (words[1] === "other") {
    const day = weekdayIndex(words[2]);
    const diff = (day - utcWeekday(from) + 7) % 7;
    const first = addDays(from, diff || 14);
    const elapsed = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000;
    return addDays(first, Math.max(0, Math.floor(elapsed / 14) + 1) * 14);
  }

  // "weekday": next Mon–Fri strictly after the floor. At most 2 skips.
  if (words[1] === "weekday") {
    let date = addDays(floor, 1);
    while (utcWeekday(date) === 0 || utcWeekday(date) === 6) date = addDays(date, 1);
    return date;
  }

  // "last day" / "<Nth>": that day each month, clamped to month length.
  // Start at the floor's month while retaining the rule's day anchor.
  const nth = /^(\d+)(?:st|nd|rd|th)$/.exec(words[1]);
  if (words[1] === "last" || nth) {
    const wanted = nth ? Number(nth[1]) : 31;
    const [year, month] = floor.split("-").map(Number);
    for (let k = 0; k < 5000; k++) {
      const total = year * 12 + (month - 1) + k;
      const y = Math.floor(total / 12);
      const m = total % 12;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const date = new Date(Date.UTC(y, m, Math.min(wanted, lastDay)))
        .toISOString()
        .slice(0, 10);
      if (date > floor) return date;
    }
    throw new Error(`recurrence walk exceeded 5000 months: ${rule}`);
  }

  const day = weekdayIndex(words[1]);
  if (day >= 0) {
    const diff = (day - utcWeekday(floor) + 7) % 7 || 7;
    return addDays(floor, diff);
  }

  const n = words.length === 3 ? Number(words[1]) : 1;
  const unit = words[words.length - 1].replace(/s$/, "");
  const months = unit === "month" ? n : unit === "year" ? n * 12 : 0;
  const days = unit === "day" ? n : unit === "week" ? n * 7 : 0;

  // Jump close to the floor before checking month-end clamping. This keeps
  // long-overdue daily tasks from walking through thousands of old dates.
  const elapsedDays = (Date.parse(`${floor}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  const elapsedMonths = (Number(floor.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(floor.slice(5, 7)) - Number(from.slice(5, 7));
  const start = months ? Math.max(1, Math.floor(elapsedMonths / months)) : Math.max(1, Math.floor(elapsedDays / days) + 1);
  for (let step = start; ; step++) {
    const date = months ? addMonths(from, step * months) : addDays(from, step * days);
    if (date > floor) return date;
  }
}

// End dates are inclusive: an occurrence on the end date is valid, while
// advancing beyond it means the recurring task has reached its final run.
export function nextOccurrenceWithinEnd(
  rule: string,
  from: string,
  today: string,
  endDate: string | null,
): string | null {
  const next = nextOccurrence(rule, from, today);
  return endDate && next > endDate ? null : next;
}

// The due date a rule starts on when no date was given alongside it.
// Interval rules ("every 3 days") run from today; anchored rules ("every
// monday", "every 15th") jump to the next matching day, so a rule picked
// mid-week doesn't land on a date that doesn't satisfy it.
export function firstOccurrence(rule: string, today: string): string {
  const canonical = parseRecurrence(rule);
  if (!canonical) throw new Error(`Unsupported recurrence: ${rule}`);
  return /^every!? (\d+ )?(day|week|month|year)s?$/.test(canonical)
    ? today
    : nextOccurrence(canonical, today, today);
}
