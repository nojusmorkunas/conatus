import { numberValue } from "./english";

type TimeMatch = { time: string | null; length: number };
type DurationMatch = { minutes: number | null; length: number };

export function matchTime(words: string[], i: number): TimeMatch | null {
  const prefixed = words[i] === "at";
  const start = i + Number(prefixed);
  const word = words[start] ?? "";
  if (word === "noon" || word === "midnight") return { time: word === "noon" ? "12:00" : "00:00", length: Number(prefixed) + 1 };
  const suffix = /^[ap]\.?m$/.test(words[start + 1] ?? "") ? words[start + 1] : "";
  if (prefixed && !suffix && /^[ap]$/.test(words[start + 1] ?? "") && /^\d{1,2}(?::\d{2})?$/.test(word)) return { time: null, length: 3 };
  if (!prefixed && !suffix && !/\d(?::\d{2}|[ap]\.?m)$/.test(word)) return null;
  const match = /^(\d{1,2})(?::(\d{2}))?([ap]\.?m)?$/.exec(word + suffix);
  if (!match) return null;
  const length = Number(prefixed) + 1 + Number(Boolean(suffix));
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return { time: null, length };
  if (match[3]) hour = hour % 12 + (match[3][0] === "p" ? 12 : 0);
  return { time: String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0"), length };
}

function durationValue(text: string): number | null {
  const expanded = text.replace(/^(an?|one) hour and a half$/, "1.5 hours");
  let rest = expanded;
  let minutes = 0;
  let previousUnit = "";
  for (let part = 0; part < 2; part++) {
    const match = /^(.+?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?=$|[\s\d])/.exec(rest);
    if (!match) return null;
    const amount = numberValue(match[1]);
    const unit = match[2].startsWith("h") ? "h" : "m";
    if (amount === null || (previousUnit && (previousUnit !== "h" || unit !== "m"))) return null;
    minutes += amount * (unit === "h" ? 60 : 1);
    previousUnit = unit;
    rest = rest.slice(match[0].length).trim().replace(/^and\s+/, "");
    if (!rest) return minutes;
  }
  return null;
}

export function matchDuration(words: string[], i: number): DurationMatch | null {
  if (words[i] !== "for") return null;
  for (let length = Math.min(11, words.length - i); length >= 2; length--) {
    const minutes = durationValue(words.slice(i + 1, i + length).join(" "));
    if (minutes === null) continue;
    // During an edit, "for 1h 30" is unfinished, not a one-hour duration.
    const next = words[i + length];
    const continues = next && (numberValue(next) !== null || /^(?:\d+(?:\.\d+)?)?(?:hours?|hrs?|h|minutes?|mins?|m)$/.test(next) || (next === "and" && numberValue(words[i + length + 1] ?? "") !== null));
    if (continues) return { minutes: null, length: length + 1 + Number(next === "and" && i + length + 1 < words.length) };
    return { minutes: Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null, length };
  }
  return null;
}
