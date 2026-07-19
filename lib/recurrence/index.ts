const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

function weekdayIndex(word: string): number {
  return WEEKDAY_NAMES.findIndex(
    (name) => name === word || (word.length === 3 && name.startsWith(word)),
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11 ? "st"
    : n % 10 === 2 && n !== 12 ? "nd"
    : n % 10 === 3 && n !== 13 ? "rd"
    : "th";
  return `${n}${suffix}`;
}

// Rule body after the "every"/"every!" head → canonical body, else null.
// Bodies: "day|week|month|year", "N days|weeks|months", "<weekday>",
// "weekday" (Mon–Fri), "last day", "<Nth>" (day of month, 1st–31st),
// "other <day|week|month|weekday>" ("other week" → "2 weeks").
function parseRuleBody(words: string[]): string | null {
  if (words.length === 1) {
    const day = weekdayIndex(words[0]);
    if (day >= 0) return WEEKDAY_NAMES[day];
    if (words[0] === "weekday") return "weekday";
    const nth = /^([1-9]\d?)(?:st|nd|rd|th)$/.exec(words[0]);
    if (nth && Number(nth[1]) <= 31 && words[0] === ordinal(Number(nth[1])))
      return words[0];
    const unit = /^(day|week|month|year)s?$/.exec(words[0]);
    return unit ? unit[1] : null;
  }

  if (words.length === 2) {
    if (words[0] === "other") {
      const day = weekdayIndex(words[1]);
      if (day >= 0) return `other ${WEEKDAY_NAMES[day]}`;
      const unit = /^(day|week|month)s?$/.exec(words[1]);
      return unit ? `2 ${unit[1]}s` : null;
    }
    if (words[0] === "last" && /^days?$/.test(words[1])) return "last day";
    if (/^[1-9]\d*$/.test(words[0])) {
      const unit = /^(day|week|month)s?$/.exec(words[1]);
      if (!unit) return null;
      const n = Number(words[0]);
      return n === 1 ? unit[1] : `${n} ${unit[1]}s`;
    }
  }

  return null;
}

// "every <body>" or "every! <body>" → canonical rule, else null.
// "every!" is Todoist's completion-relative marker: the schedule restarts
// from the completion day instead of stepping from the old due date.
// Canonical strings round-trip: parseRecurrence(canonical) === canonical.
export function parseRecurrence(text: string): string | null {
  const [head, ...rest] = text.trim().toLowerCase().split(/\s+/);
  if ((head !== "every" && head !== "every!") || rest.length === 0) return null;
  const body = parseRuleBody(rest);
  return body === null ? null : `${head} ${body}`;
}

// DST stance: all recurrence math is calendar-date arithmetic on
// 'YYYY-MM-DD' strings via Date.UTC. A due *time* is stored separately and
// never shifted by this module, so DST transitions cannot skew occurrences
// by construction — no timezone database needed.
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
  const words = rule.split(" ");
  if (words[0] === "every!") from = today;
  const floor = from > today ? from : today;

  // "other <weekday>": fortnightly, anchor-preserving. The anchor is `from`
  // itself when it falls on the weekday, else the first such weekday after
  // it; occurrences are anchor + 14k. A long-overdue task catches up to the
  // next occurrence that keeps the original fortnight parity — it does not
  // reset to "next <weekday> after today".
  if (words[1] === "other") {
    const day = weekdayIndex(words[2]);
    const diff = (day - utcWeekday(from) + 7) % 7;
    let date = addDays(from, diff || 14);
    while (date <= today) date = addDays(date, 14);
    return date;
  }

  // "weekday": next Mon–Fri strictly after the floor. At most 2 skips.
  if (words[1] === "weekday") {
    let date = addDays(floor, 1);
    while (utcWeekday(date) === 0 || utcWeekday(date) === 6) date = addDays(date, 1);
    return date;
  }

  // "last day" / "<Nth>": that day each month, clamped to month length
  // ("last day" ≡ 31st under clamping). Walk month-by-month from the
  // anchor month so a clamped Feb never drifts the day-of-month anchor.
  // Candidates advance ~monthly, so the walk terminates as soon as it
  // passes `floor`; the 5000-month cap (~415 years) only guards against
  // a bug ever making this loop infinite.
  const nth = /^(\d+)(?:st|nd|rd|th)$/.exec(words[1]);
  if (words[1] === "last" || nth) {
    const wanted = nth ? Number(nth[1]) : 31;
    const [year, month] = from.split("-").map(Number);
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

  for (let step = 1; ; step++) {
    const date = months ? addMonths(from, step * months) : addDays(from, step * days);
    if (date > today) return date;
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
