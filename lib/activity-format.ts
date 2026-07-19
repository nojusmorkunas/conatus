import type { ActivityEventType } from "@/lib/db/activity";
import { pastDateLabel } from "@/lib/dates";

export type ActivityEvent = {
  id: string;
  type: string;
  taskContent: string;
  projectName: string;
  createdAt: Date;
};

export function activityText(event: Pick<ActivityEvent, "type" | "taskContent" | "projectName">) {
  const { type, taskContent, projectName } = event;
  switch (type as ActivityEventType) {
    case "task.created":
      return `added "${taskContent}" · ${projectName}`;
    case "task.completed":
      return `completed "${taskContent}" · ${projectName}`;
    case "task.uncompleted":
      return `uncompleted "${taskContent}" · ${projectName}`;
    case "task.deleted":
      return `deleted "${taskContent}" · ${projectName}`;
    case "comment.added":
      return `commented on "${taskContent}" · ${projectName}`;
    case "project.created":
      return `created project "${projectName}"`;
    case "project.archived":
      return `archived project "${projectName}"`;
    case "project.deleted":
      return `deleted project "${projectName}"`;
    default:
      return `${type} · ${projectName}`;
  }
}

export function groupByDay<T extends { createdAt: Date }>(
  events: T[],
  today: string,
  timezone: string,
  dateFormat: string,
) {
  const groups: { heading: string; events: T[] }[] = [];
  for (const event of events) {
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      event.createdAt,
    );
    const heading = pastDateLabel(dateKey, today, dateFormat);
    const group = groups.at(-1);
    if (group?.heading === heading) group.events.push(event);
    else groups.push({ heading, events: [event] });
  }
  return groups;
}
