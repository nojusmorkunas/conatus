import { cleanWord, numberValue, ordinalValue, weekdayIndex } from "./english";

const DAY = 86_400_000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
type DateMatch = { date: string; length: number };

function format(date: Date): string | null {
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : null;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? format(date) : null;
}

function addDays(date: string, n: number): string | null {
  return format(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY));
}

function addMonths(date: string, n: number): string | null {
  const [year, month, day] = date.split("-").map(Number);
  const total = year * 12 + month - 1 + n;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const end = new Date(0);
  end.setUTCFullYear(y, m + 1, 0);
  return validDate(y, m + 1, Math.min(day, end.getUTCDate()));
}

function result(date: string | null, length: number): DateMatch | null {
  return date ? { date, length } : null;
}

function monthIndex(word: string): number {
  return word === "sept" ? 8 : MONTHS.findIndex((month) => month === word || (word.length === 3 && month.startsWith(word)));
}

function nextCalendarDate(today: string, month: number, day: number, year?: number): string | null {
  if (year !== undefined) return validDate(year, month, day);
  const currentYear = Number(today.slice(0, 4));
  const current = validDate(currentYear, month, day);
  if (current && current >= today) return current;
  return validDate(currentYear + 1, month, day);
}

function relative(words: string[], i: number, today: string): DateMatch | null {
  const prefixed = words[i] === "in";
  const start = i + Number(prefixed);
  for (const size of [2, 1]) {
    const n = numberValue(words.slice(start, start + size).join(" "));
    const unit = /^(day|week|month|year)s?$/.exec(words[start + size] ?? "");
    if (n === null || !Number.isSafeInteger(n) || n < 0 || !unit) continue;
    let length = size + 1 + Number(prefixed);
    if (words[i + length] === "from" && words[i + length + 1] === "now") length += 2;
    else if (!prefixed) continue;
    return result(unit[1] === "day" || unit[1] === "week"
      ? addDays(today, n * (unit[1] === "week" ? 7 : 1))
      : addMonths(today, n * (unit[1] === "year" ? 12 : 1)), length);
  }
  return null;
}

// Calendar dates only. Also used by filters and the deadline parser; a time
// such as {noon} must never turn into a date-only deadline.
export function matchDate(source: string[], i: number, today: string): DateMatch | null {
  const words = source.map((word) => cleanWord(word).toLowerCase());
  const w = words[i];
  if (!w) return null;
  if (w === "on") {
    if (words[i + 1] === "on") return null;
    const next = matchDate(words, i + 1, today);
    return next && { ...next, length: next.length + 1 };
  }
  if (w === "the") {
    // "the 15th" / "on the first" means the next such day of a month.
    for (const size of [2, 1]) {
      if (i + 1 + size > words.length) continue;
      const day = ordinalValue(words.slice(i + 1, i + 1 + size).join(" "));
      if (!day) continue;
      const [year, month] = today.split("-").map(Number);
      for (let offset = 0; offset < 3; offset++) {
        const total = year * 12 + month - 1 + offset;
        const date = validDate(Math.floor(total / 12), total % 12 + 1, day);
        if (date && date >= today) return { date, length: size + 1 };
      }
    }
    return null;
  }
  if (w === "today" || w === "tod") return { date: today, length: 1 };
  if (w === "tomorrow" || w === "tmr") return result(addDays(today, 1), 1);
  if (words.slice(i, i + 3).join(" ") === "day after tomorrow") return result(addDays(today, 2), 3);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const day = weekdayIndex(w);
  if (day >= 0) return result(addDays(today, (day - weekday + 7) % 7 || 7), 1);
  if (["this", "coming", "upcoming"].includes(w)) {
    const nextDay = weekdayIndex(words[i + 1] ?? "");
    if (nextDay >= 0) return result(addDays(today, (nextDay - weekday + 7) % 7 || (w === "this" ? 0 : 7)), 2);
  }
  if (w === "next") {
    const next = words[i + 1];
    if (next === "month" || next === "year") return result(addMonths(today, next === "year" ? 12 : 1), 2);
    const diff = 7 - ((weekday + 6) % 7);
    if (next === "week") return result(addDays(today, diff), 2);
    const nextDay = weekdayIndex(next ?? "");
    if (nextDay >= 0) return result(addDays(today, diff + (nextDay + 6) % 7), 2);
  }
  const offset = relative(words, i, today);
  if (offset) return offset;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (iso) return result(validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])), 1);
  // Numeric dates remain day-first. Punctuation around a date is optional;
  // punctuation inside it is meaningful and must not be stripped.
  const dm = /^(\d{1,2})[/.](\d{1,2})$/.exec(w);
  if (dm) return result(nextCalendarDate(today, Number(dm[2]), Number(dm[1])), 1);
  const monthFirst = monthIndex(w);
  const monthSecond = monthIndex(words[i + 1] ?? "");
  const dayWord = monthFirst >= 0 ? words[i + 1] : w;
  const month = monthFirst >= 0 ? monthFirst : monthSecond;
  const monthDay = /^\d{1,2}$/.test(dayWord ?? "") ? Number(dayWord) : ordinalValue(dayWord ?? "");
  if (month >= 0 && monthDay) {
    const yearWord = words[i + 2];
    const explicitYear = /^\d{4}$/.test(yearWord ?? "") ? Number(yearWord) : undefined;
    return result(nextCalendarDate(today, month + 1, monthDay, explicitYear), explicitYear === undefined ? 2 : 3);
  }
  return null;
}
