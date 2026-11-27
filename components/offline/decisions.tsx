"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CircleAlert } from "lucide-react";

import { useDatePreferences } from "@/components/date-input";
import { recurrenceLabel } from "@/components/tasks/recurrence-picker";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/offline/api";
import { conflictLines } from "@/lib/offline/decisions";
import { useDecisions, useOffline, useSnapshot, useTodayDate } from "@/lib/offline/hooks";
import type { Conflict, PendingChange } from "@/lib/offline/types";

/** Each choice changes the queue and asks for a sync, so what was decided goes out at once. */
function useDecide() {
  const { outbox, scheduler } = useOffline();
  return {
    keepMine: (conflict: Conflict) => { outbox.keepMine(conflict); scheduler.request(); },
    keepTheirs: (conflict: Conflict) => { outbox.keepTheirs(conflict); scheduler.request(); },
    retry: (change: PendingChange) => { outbox.retry(change); scheduler.request(); },
    discard: async (change: PendingChange) => {
      // Offline, the server's copy can't be fetched back; the next sync brings it.
      await outbox.discard(change, api).catch(() => {});
      scheduler.request();
    },
  };
}

const card = "rounded-lg border border-destructive/30 p-3 text-sm";

export function ConflictNotice({ conflict }: { conflict: Conflict }) {
  const task = useSnapshot((snapshot) => snapshot.tasks.get(conflict.taskId));
  const labels = useSnapshot((snapshot) => snapshot.labels);
  const today = useTodayDate();
  const { dateFormat } = useDatePreferences();
  const { keepMine, keepTheirs } = useDecide();
  const lines = task ? conflictLines(task, conflict, { labels, today, dateFormat, repeats: recurrenceLabel }) : [];
  return (
    <div role="group" aria-label="Changed on another device" className={card}>
      <p className="flex items-center gap-1.5 font-medium text-destructive">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {conflict.deleted ? "Deleted on another device" : "Changed on another device too"}
      </p>
      {task && <p className="mt-1.5 break-words">{task.content}</p>}
      {conflict.deleted ? (
        <p className="mt-1 text-muted-foreground">You changed this task here after it was deleted elsewhere.</p>
      ) : (
        lines.map((line) => (
          <div key={line.field} className="mt-2">
            <p className="text-xs font-medium text-muted-foreground">{line.field}</p>
            <p className="break-words">This device: {line.mine}</p>
            <p className="break-words">Other device: {line.theirs}</p>
          </div>
        ))
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => keepMine(conflict)}>{conflict.deleted ? "Keep it" : "Keep mine"}</Button>
        <Button variant="outline" size="sm" onClick={() => keepTheirs(conflict)}>{conflict.deleted ? "Delete it here too" : "Keep theirs"}</Button>
      </div>
    </div>
  );
}

export function FailureNotice({ change }: { change: PendingChange }) {
  const { retry, discard } = useDecide();
  return (
    <div role="group" aria-label="Couldn't sync" className={card}>
      <p className="flex items-center gap-1.5 font-medium text-destructive">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Couldn&apos;t sync
      </p>
      <p className="mt-1.5 break-words">{change.summary}</p>
      <p className="mt-0.5 break-words text-muted-foreground">{change.failure}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => discard(change)}>Discard</Button>
        <Button variant="outline" size="sm" onClick={() => retry(change)}>Retry</Button>
      </div>
    </div>
  );
}

/** What belongs to one task, for its details to lead with. */
export function TaskDecisions({ taskId }: { taskId: string }) {
  const { conflicts, failedChanges } = useDecisions();
  const conflict = conflicts.find((item) => item.taskId === taskId);
  const failed = failedChanges.find((change) => change.id === taskId);
  if (!conflict && !failed) return null;
  return (
    <div className="mb-4 space-y-2">
      {conflict && <ConflictNotice conflict={conflict} />}
      {failed && <FailureNotice change={failed} />}
    </div>
  );
}

/** The decisions dialog, opened from the sync status pill's Review button. */
export function DecisionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { conflicts, failedChanges } = useDecisions();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-y-auto rounded-xl border bg-background p-5 text-sm shadow-xl outline-none">
          <Dialog.Title className="text-base font-semibold">Needs a decision</Dialog.Title>
          {conflicts.map((conflict) => <ConflictNotice key={conflict.taskId} conflict={conflict} />)}
          {failedChanges.map((change) => <FailureNotice key={change.seq} change={change} />)}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
