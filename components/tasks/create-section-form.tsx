"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWrites } from "@/lib/offline/hooks";

export function CreateSectionForm({ projectId, afterId }: { projectId: string; afterId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const { lists } = useWrites();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    // Added at the end, then moved to where the button was.
    lists.placeSection(lists.createSection(projectId, name.trim()), afterId);
    setName("");
    setExpanded(false);
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
      <Button type="submit" size="sm">
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
