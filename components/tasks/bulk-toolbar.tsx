"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Label, Project } from "./types";

export function BulkToolbar({
  count,
  projects,
  labels,
  onComplete,
  onDelete,
  onMove,
  onPriority,
  onDueDate,
  onLabel,
}: {
  count: number;
  projects: Project[];
  labels: Label[];
  onComplete: () => void;
  onDelete: () => void;
  onMove: (projectId: string) => void;
  onPriority: (priority: number) => void;
  onDueDate: (dueDate: string | null) => void;
  onLabel: (labelId: string) => void;
}) {
  const [dueDate, setDueDate] = useState("");

  return (
    <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
      <span className="px-1 text-sm text-muted-foreground">{count} selected</span>
      <Button size="sm" onClick={onComplete}>Complete</Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>Move to Trash</Button>
      <Select onValueChange={(value) => typeof value === "string" && onMove(value)}>
        <SelectTrigger size="sm"><SelectValue placeholder="Move" /></SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={(value) => typeof value === "string" && onPriority(Number(value))}>
        <SelectTrigger size="sm"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4].map((priority) => (
            <SelectItem key={priority} value={String(priority)}>P{priority}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        aria-label="Due date"
        className="h-7 w-auto"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <Button size="sm" variant="outline" onClick={() => onDueDate(dueDate || null)}>
        Apply date
      </Button>
      <Select onValueChange={(value) => typeof value === "string" && onLabel(value)}>
        <SelectTrigger size="sm"><SelectValue placeholder="Add label" /></SelectTrigger>
        <SelectContent>
          {labels.map((label) => (
            <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
