import type { TaskWithLabels } from "@/components/tasks/types";

import type { Snapshot } from "./store";
import type { TaskEntity } from "./types";

// Memoized rows compare tasks by identity, so a task that didn't change must give the same view back.
const views = new WeakMap<TaskEntity, { labels: Snapshot["labels"]; view: TaskWithLabels }>();

/** [task] as the task components render it, with its labels looked up in [snapshot]. */
export function taskView(task: TaskEntity, snapshot: Pick<Snapshot, "labels">): TaskWithLabels {
  const cached = views.get(task);
  if (cached?.labels === snapshot.labels) return cached.view;
  const { labelIds, ...rest } = task;
  // A label the store no longer has (deleted elsewhere) just drops off.
  const labels = labelIds.flatMap((id) => snapshot.labels.get(id) ?? []);
  const view = { ...rest, labels };
  views.set(task, { labels: snapshot.labels, view });
  return view;
}
