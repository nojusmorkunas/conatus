export function todayInTimezone(timeZone: string): string {
  return dateInTimezone(new Date(), timeZone);
}

export function dateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function addDays(date: string, days: number): string {
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function formatDate(date: string, dateFormat: string): string {
  const [year, month, day] = date.split("-");
  return dateFormat
    .replace("yyyy", year)
    .replace("MM", month)
    .replace("dd", day);
}

export function dueLabel(dueDate: string, today: string, dateFormat: string): string {
  if (dueDate === today) return "Today";
  if (dueDate === addDays(today, 1)) return "Tomorrow";
  if (dueDate > today && dueDate < addDays(today, 7)) {
    return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
  }
  return formatDate(dueDate, dateFormat);
}

// Sunday=0 .. Saturday=6, matching users.weekStart and Date#getUTCDay.
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// First cell of the month grid: the weekStart-aligned day on or before the 1st.
export function monthGridStart(month: string, weekStart: number): string {
  const first = `${month}-01`;
  const back = (weekdayOf(first) - weekStart + 7) % 7;
  return addDays(first, -back);
}

// Sunday=0 .. Saturday=6. weekStart-aligned start of the week containing `date`.
export function weekStartOf(date: string, weekStart: number): string {
  const back = (weekdayOf(date) - weekStart + 7) % 7;
  return addDays(date, -back);
}

export function pastDateLabel(date: string, today: string, dateFormat: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  if (date < today && date > addDays(today, -7)) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
  }
  return formatDate(date, dateFormat);
}
