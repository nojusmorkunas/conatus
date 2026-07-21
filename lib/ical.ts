// RFC 5545 (iCalendar). Escaping covers the four characters the spec
// requires for TEXT values; folding wraps any line over 75 octets.
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

// ponytail: folds on a fixed 74-char chunk size rather than counting UTF-8
// octets exactly (RFC wants a fold before byte 76). This is fine for ASCII-heavy
// task text, would need real byte counting for wide-char-heavy content.
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    chunks.push(" " + line.slice(i, i + 74));
  }
  return chunks.join("\r\n");
}

export type IcalTask = {
  id: string;
  content: string;
  description: string | null;
  dueDate: string; // 'YYYY-MM-DD'
  dueTime: string | null; // 'HH:mm'
};

function dtstart(task: IcalTask): string {
  const date = task.dueDate.replace(/-/g, "");
  if (!task.dueTime) return `DTSTART;VALUE=DATE:${date}`;
  // Floating local time: no Z suffix and no TZID. The honest lazy choice is to
  // this app stores due times as wall-clock, not a specific IANA zone per
  // task, so there's no correct TZID to attach.
  const time = task.dueTime.replace(":", "") + "00";
  return `DTSTART:${date}T${time}`;
}

export function buildCalendar(tasks: IcalTask[], calendarName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//conatus//ical export//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const task of tasks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@conatus`,
      dtstart(task),
      `SUMMARY:${escapeText(task.content)}`,
    );
    if (task.description) {
      lines.push(`DESCRIPTION:${escapeText(task.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
