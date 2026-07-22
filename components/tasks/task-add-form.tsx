"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseQuickAdd } from "@/lib/parser/quick-add";
import { priorityLabels } from "./priority";

export function TaskAddForm({
  projectId,
  sectionId,
  parentId,
  afterId,
  today,
  labels,
  onCreated,
  onError,
  initiallyExpanded = false,
}: {
  projectId: string;
  sectionId: string | null;
  parentId?: string;
  afterId?: string | null;
  today: string;
  labels: { id: string; name: string }[];
  onCreated: () => void;
  onError: () => void;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("4");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  // "q" shortcut expands the first quick-add form on the page (subtask
  // forms only exist while expanded, so they're never "first" at rest).
  useEffect(() => {
    function onFocusRequest() {
      const first = document.querySelector<HTMLElement>("[data-quick-add]");
      if (first !== rootRef.current) return;
      setExpanded(true);
    }
    window.addEventListener("quick-add:focus", onFocusRequest);
    return () => window.removeEventListener("quick-add:focus", onFocusRequest);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;

    setPending(true);
    const parsed = parseQuickAdd(content.trim(), { today });

    // Explicit form fields win over parsed tokens; unresolved #project/@label
    // tokens are dropped rather than kept as text.
    let targetProjectId = projectId;
    let targetSectionId = sectionId;
    if (parsed.projectName && !parentId) {
      const projectsResponse = await fetch("/api/projects");
      if (projectsResponse.ok) {
        const all: { id: string; name: string }[] =
          await projectsResponse.json();
        const name = parsed.projectName.toLowerCase();
        const match = all.find((p) => p.name.toLowerCase() === name);
        if (match && match.id !== projectId) {
          targetProjectId = match.id;
          targetSectionId = null;
        }
      }
    }

    const labelIds = parsed.labelNames.flatMap((name) => {
      const match = labels.find(
        (label) => label.name.toLowerCase() === name.toLowerCase(),
      );
      return match ? [match.id] : [];
    });

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: targetProjectId,
        sectionId: targetSectionId,
        parentId,
        ...(afterId !== undefined ? { afterId } : {}),
        content: parsed.content,
        description: description.trim() || undefined,
        priority: priority === "4" ? parsed.priority : Number(priority),
        dueDate: dueDate || parsed.dueDate || undefined,
        dueTime: dueDate ? dueTime || undefined : parsed.dueTime || undefined,
        recurrence: parsed.recurrence || undefined,
        deadlineDate: parsed.deadlineDate || undefined,
        durationMinutes: parsed.durationMinutes || undefined,
      }),
    });

    if (!response.ok) {
      setPending(false);
      onError();
      return;
    }

    if (labelIds.length > 0) {
      const task: { id: string } = await response.json();
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelIds }),
      });
    }
    setPending(false);

    setContent("");
    setDescription("");
    setPriority("4");
    setDueDate("");
    setDueTime("");
    // Keep the composer ready for the next item. This makes Enter a fast
    // capture flow instead of forcing people to reopen the form each time.
    setExpanded(true);
    onCreated();
  }

  if (!expanded) {
    return (
      <button
        ref={rootRef as React.Ref<HTMLButtonElement>}
        type="button"
        data-quick-add
        className="group/add-task flex w-full items-center gap-2 rounded-lg border border-dashed border-transparent px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/35 hover:text-foreground"
        onClick={() => setExpanded(true)}
      >
        <span className="flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/add-task:bg-foreground group-hover/add-task:text-background">
          <Plus className="size-3.5" />
        </span>
        New task
      </button>
    );
  }

  return (
    <form
      ref={rootRef as React.Ref<HTMLFormElement>}
      data-quick-add
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") setExpanded(false);
      }}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
    >
      <Input
        autoFocus
        placeholder="Task name (try: pay rent tomorrow p2 #Home @bills)"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <Textarea
        placeholder="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="w-auto"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <Input
          type="time"
          className="w-auto"
          value={dueTime}
          onChange={(event) => setDueTime(event.target.value)}
        />
        <Select
          value={priority}
          onValueChange={(value) => setPriority(value ?? "4")}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {priorityLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={pending}>
          Add task
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
