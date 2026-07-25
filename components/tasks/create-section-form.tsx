"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateSectionForm({
  projectId,
  afterId,
  onCreated,
  onError,
}: {
  projectId: string;
  afterId: string | null;
  onCreated: () => void;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setPending(true);
    const response = await fetch("/api/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name: name.trim(), afterId }),
    });
    setPending(false);

    if (!response.ok) {
      onError();
      return;
    }

    setName("");
    setExpanded(false);
    onCreated();
  }

  if (!expanded) {
    return (
      <div className="group/add-section flex h-8 items-center pl-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover/add-section:opacity-100 hover:text-foreground focus-visible:opacity-100"
          onClick={() => setExpanded(true)}
        >
          <span className="flex size-5 items-center justify-center rounded-md border border-dashed border-border" aria-hidden>
            <Plus className="size-3" />
          </span>
          <span className="shrink-0">New section</span>
          <span className="h-px flex-1 border-t border-dashed border-border" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        autoFocus
        placeholder="Add section"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
