import { tasks } from "@/lib/db/schema";

// Order for lists grouped by date (Focus, Upcoming, labels, filters), which mix
// projects, so manual order alone means little. Within a day, timed tasks come
// first in time order (Postgres sorts NULL times last), then priority, then
// manual order. Matches groupToday in the Android app.
export const dueOrder = [tasks.dueDate, tasks.dueTime, tasks.priority, tasks.order];
