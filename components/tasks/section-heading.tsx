"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Copy, Ellipsis, FolderInput, GripVertical, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { useSnapshot, useWrites } from "@/lib/offline/hooks";
import { visibleProjects } from "@/lib/task-views";
import { cn } from "@/lib/utils";
import type { Section } from "./types";

export function SectionHeading({
  section,
  taskCount,
  selecting,
  collapsed,
  onToggleCollapsed,
}: {
  section: Section;
  taskCount: number;
  selecting: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const cancelled = useRef(false);
  const { lists } = useWrites();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: selecting,
    data: { type: "section" },
  });

  function beginEditing() {
    cancelled.current = false;
    setName(section.name);
    setEditing(true);
  }

  function cancelEditing() {
    cancelled.current = true;
    setName(section.name);
    setEditing(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setEditing(false);
    if (name.trim() && name !== section.name) lists.renameSection(section, name.trim());
  }

  // Moving and copying a section across projects only happen on the server, and the next sync brings the result.
  function runOnServer(body: object) {
    api.patch(`/api/sections/${section.id}`, body).catch(() => {});
  }

  if (editing) {
    return (
      <form ref={setNodeRef} onSubmit={submit} className="flex" style={{ transform: CSS.Transform.toString(transform), transition }}>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
        />
      </form>
    );
  }

  return (
    <div
      id={`section-${section.id}`}
      ref={setNodeRef}
      className={cn(
        "group sticky top-0 z-20 mb-2 flex items-center gap-2 bg-background/95 py-1.5 pr-1 pl-7 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        isDragging && "z-0 opacity-40",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Sections drag by the handle only (Todoist behavior); the heading
          itself stays plain so clicks never turn into drags. */}
      <span
        {...attributes}
        {...listeners}
        aria-label="Drag section"
        className="absolute left-1 flex size-5 cursor-grab touch-manipulation items-center justify-center text-muted-foreground opacity-100 transition-opacity active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <GripVertical aria-hidden className="size-4" />
      </span>
      <h2 className="min-w-0">
        <button
          type="button"
          onClick={() => { if (!window.getSelection()?.toString()) beginEditing(); }}
          disabled={selecting}
          className="block max-w-64 cursor-text select-text truncate text-left text-sm font-bold text-foreground disabled:cursor-default"
        >
          {section.name}
        </button>
      </h2>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {taskCount}
      </span>
      <span aria-hidden className="mx-1 h-px min-w-6 flex-1 bg-border/80" />
      {!selecting && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`More options for ${section.name}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
              >
                <Ellipsis className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={beginEditing}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><FolderInput /> Move to…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <MoveTargets exclude={section.projectId} onPick={(projectId) => runOnServer({ projectId })} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => runOnServer({ duplicate: true })}><Copy /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(`${location.origin}/projects/${encodeURIComponent(section.projectId)}#section-${section.id}`)}>
              <LinkIcon /> Copy link to section
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => lists.archiveSection(section, true)}><Archive /> Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete section "${section.name}"? Its tasks will move to Trash.`)) lists.deleteSection(section);
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
      )}
      <button
        type="button"
        aria-label={collapsed ? "Expand section" : "Collapse section"}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
    </div>
  );
}

// A component of its own so only an open menu listens to the store.
function MoveTargets({ exclude, onPick }: { exclude: string; onPick: (projectId: string) => void }) {
  const rows = useSnapshot((snapshot) => snapshot.projects);
  const projects = useMemo(() => visibleProjects(rows.values()).filter((project) => project.id !== exclude), [rows, exclude]);
  if (projects.length === 0) return <p className="px-1.5 py-1 text-xs text-muted-foreground">No other projects</p>;
  return projects.map((project) => <DropdownMenuItem key={project.id} onClick={() => onPick(project.id)}>{project.name}</DropdownMenuItem>);
}
