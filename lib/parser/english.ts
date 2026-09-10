export const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

// Keep punctuation in the source ranges; remove it only from matching copies.
// The exclamation mark in every! is syntax, not sentence punctuation.
export function cleanWord(word: string): string {
  return /^every![.,!?;:]*$/i.test(word) ? "every!" : word.replace(/[.,!?;:]+$/, "");
}

export function weekdayIndex(word: string): number {
  const normalized = cleanWord(word).toLowerCase();
  return WEEKDAY_NAMES.findIndex((name) => name === normalized || (normalized.length === 3 && name.startsWith(normalized)));
}

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberValue(text: string): number | null {
  const value = text.toLowerCase().trim().replace(/-/g, " ");
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value === "a" || value === "an") return 1;
  if (/^half(?: an?)?$/.test(value)) return 0.5;
  if (/^(?:a )?quarter(?: of an?)?$/.test(value)) return 0.25;
  const small = SMALL.indexOf(value);
  if (small >= 0) return small;
  const [tens, ones, extra] = value.split(" ");
  const ten = TENS.indexOf(tens);
  const one = SMALL.indexOf(ones);
  return ten >= 2 && !extra && (!ones || (one > 0 && one < 10)) ? ten * 10 + (ones ? one : 0) : null;
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];

export function ordinalValue(text: string): number | null {
  const value = text.toLowerCase().replace(/-/g, " ");
  const numeric = /^(\d+)(st|nd|rd|th)$/.exec(value);
  if (numeric) {
    const n = Number(numeric[1]);
    return n >= 1 && n <= 31 && ordinal(n) === value ? n : null;
  }
  const direct = ORDINALS.indexOf(value);
  if (direct > 0) return direct;
  if (value === "thirtieth") return 30;
  if (value.split(" ").length !== 2) return null;
  const [tens, unit] = value.split(" ");
  const one = ORDINALS.indexOf(unit);
  if (tens === "twenty" && one >= 1 && one <= 9) return 20 + one;
  return tens === "thirty" && one === 1 ? 31 : null;
}
