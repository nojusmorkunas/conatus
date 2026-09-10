// Convert a local wall-clock minute to an instant without depending on the
// server's time zone. Reject nonexistent spring-forward times; for a repeated
// fall-back minute, choose its first occurrence.
export function localDateTimeToUtc(value: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wall = Date.parse(value + ":00Z");
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const local = (ms: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
      return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":" + parts.minute + ":" + parts.second;
    };
    const offsets = new Set([-36, 0, 36].map((hours) => {
      const instant = wall + hours * 3_600_000;
      return Date.parse(local(instant) + "Z") - instant;
    }));
    const candidates = [...offsets].map((offset) => wall - offset).filter((instant) => local(instant) === value + ":00");
    return candidates.length ? new Date(Math.min(...candidates)) : null;
  } catch {
    return null;
  }
}
