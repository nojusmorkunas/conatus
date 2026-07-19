import {
  MessageSquare,
  CheckCircle2,
  Circle,
  FolderPlus,
  Archive,
  Trash2,
  Plus,
} from "lucide-react";

import { activityText, groupByDay, type ActivityEvent } from "@/lib/activity-format";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "task.created": Plus,
  "task.completed": CheckCircle2,
  "task.uncompleted": Circle,
  "task.deleted": Trash2,
  "comment.added": MessageSquare,
  "project.created": FolderPlus,
  "project.archived": Archive,
  "project.deleted": Trash2,
};

export function ActivityList({
  events,
  today,
  timezone,
  dateFormat,
}: {
  events: ActivityEvent[];
  today: string;
  timezone: string;
  dateFormat: string;
}) {
  const groups = groupByDay(events, today, timezone, dateFormat);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.heading}>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {group.heading}
          </h2>
          <div className="flex flex-col gap-0.5">
            {group.events.map((event) => {
              const Icon = ICONS[event.type] ?? Circle;
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{activityText(event)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {event.createdAt.toLocaleTimeString("en-US", {
                      timeZone: timezone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
