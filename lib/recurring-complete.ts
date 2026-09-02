import type { tasks as tasksTable } from "@/lib/db/schema";

type TaskRow = typeof tasksTable.$inferSelect;

// Completing a recurring task advances its due date server-side instead of
// completing it, so the write has to land before the row can be re-rendered.
// An optimistic `isCompleted` would blink the task out of a list it is going
// to stay in, and deferring the write behind the undo timer would let a page
// reload race a request that was never sent.
//
// Returns the advanced row plus the patch body that undoes it, so the undo
// toast can offer a real inverse instead of cancelling a pending write.
export async function completeRecurring(task: Pick<TaskRow, "id" | "dueDate">) {
  const response = await fetch(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  if (!response.ok) return null;

  const updated: TaskRow = await response.json();
  return {
    updated,
    // Past its repeat end date the last occurrence completes for real; every
    // other one only moved, so undo puts the old due date back.
    undo: updated.isCompleted ? { completed: false } : { dueDate: task.dueDate },
  };
}
