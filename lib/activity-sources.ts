import type { ActivityEventType } from "./db/activity";

// What the activity graph on /stats counts as a day's activity. Kept out of
// lib/db/activity.ts so the settings form can import the labels without
// pulling the database and job queue into the client bundle.
export const activityGraphSources = ["completed", "created", "all"] as const;

export type ActivityGraphSource = (typeof activityGraphSources)[number];

// task.uncompleted and task.deleted are never counted. Both undo or discard
// work, so counting them would let a day get greener by reversing itself.
const sourceEvents: Record<ActivityGraphSource, ActivityEventType[]> = {
  completed: ["task.completed"],
  created: ["task.completed", "task.created"],
  all: ["task.completed", "task.created", "comment.added", "project.created"],
};

export const activityGraphSourceOptions: {
  value: ActivityGraphSource;
  label: string;
  description: string;
  // Plural noun for a cell's count. The graph strips a trailing "s" for one.
  unit: string;
}[] = [
  {
    value: "completed",
    label: "Completed tasks",
    description: "Matches the streak and daily goal above the graph.",
    unit: "completed tasks",
  },
  {
    value: "created",
    label: "Completed and created tasks",
    description: "Counts planning work as well as finishing it.",
    unit: "tasks",
  },
  {
    value: "all",
    label: "All activity",
    description: "Also counts comments and new projects.",
    unit: "activity events",
  },
];

function optionFor(source: ActivityGraphSource) {
  return activityGraphSourceOptions.find((option) => option.value === source)!;
}

export function eventsForSource(source: ActivityGraphSource): ActivityEventType[] {
  return sourceEvents[source];
}

export function activityGraphSourceLabel(source: ActivityGraphSource): string {
  return optionFor(source).label;
}

export function activityGraphSourceUnit(source: ActivityGraphSource): string {
  return optionFor(source).unit;
}
