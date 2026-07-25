"use client";

import { useState } from "react";
import { Flag, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectMember } from "./types";

export function AssigneeEditor({
  assigneeId,
  members,
  onAssign,
  onCancel,
}: {
  assigneeId: string | null;
  members: ProjectMember[];
  onAssign: (assigneeId: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Select
        value={assigneeId ?? undefined}
        onValueChange={(value) => {
          if (typeof value === "string") onAssign(value);
        }}
      >
        <SelectTrigger size="sm" aria-label="Assignee">
          <SelectValue placeholder="Choose member" />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {assigneeId && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onAssign(null)}>
          Unassign
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function DueEditor({
  dueDate,
  dueTime,
  deadlineDate,
  durationMinutes,
  onSave,
  onCancel,
}: {
  dueDate: string | null;
  dueTime: string | null;
  deadlineDate: string | null;
  durationMinutes: number | null;
  onSave: (
    dueDate: string | null,
    dueTime: string | null,
    deadlineDate: string | null,
    durationMinutes: number | null,
  ) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(dueDate ?? "");
  const [time, setTime] = useState(dueTime ?? "");
  const [deadline, setDeadline] = useState(deadlineDate ?? "");
  const [duration, setDuration] = useState(durationMinutes ? String(durationMinutes) : "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSave(date || null, date && time ? time : null, deadline || null, duration ? Number(duration) : null);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-1">
      <Input
        type="date"
        autoFocus
        className="w-auto"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <Input
        type="time"
        className="w-auto"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <span className="flex items-center gap-1">
        <Flag className="size-3 text-muted-foreground" aria-hidden />
        <Input
          type="date"
          aria-label="Deadline"
          className="w-auto"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
        {deadline && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeadline("")}>
            Clear
          </Button>
        )}
      </span>
      <span className="flex items-center gap-1">
        <Timer className="size-3 text-muted-foreground" aria-hidden />
        <Input
          type="number"
          min={1}
          max={1440}
          aria-label="Duration (minutes)"
          placeholder="min"
          className="w-20"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
        {duration && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDuration("")}>
            Clear
          </Button>
        )}
      </span>
      <Button type="submit" size="sm">
        Save
      </Button>
      {dueDate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSave(null, null, deadline || null, duration ? Number(duration) : null)}
        >
          Clear
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
