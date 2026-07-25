"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";
import type { Project, Section } from "./types";

export function SectionHeading({
  section,
  taskCount,
  selecting,
  collapsed,
  onToggleCollapsed,
  onRename,
  onDelete,
}: {
  section: Section;
  taskCount: number;
  selecting: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRename: (section: Section, name: string) => void;
  onDelete: (section: Section) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [projects, setProjects] = useState<Project[]>([]);
  const cancelled = useRef(false);
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: selecting,
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
    if (name.trim() && name !== section.name) onRename(section, name.trim());
  }

  async function runAction(body: object) {
    const response = await fetch(`/api/sections/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) router.refresh();
  }

  async function loadProjects() {
    if (projects.length) return;
    const response = await fetch("/api/projects");
    if (response.ok) setProjects(await response.json());
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
            <DropdownMenuSub onOpenChange={(open) => { if (open) void loadProjects(); }}>
              <DropdownMenuSubTrigger><FolderInput /> Move to…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {projects.filter((project) => project.id !== section.projectId).map((project) => (
                  <DropdownMenuItem key={project.id} onClick={() => void runAction({ projectId: project.id })}>
                    {project.name}
                  </DropdownMenuItem>
                ))}
                {projects.filter((project) => project.id !== section.projectId).length === 0 && (
                  <p className="px-1.5 py-1 text-xs text-muted-foreground">No other projects</p>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => void runAction({ duplicate: true })}><Copy /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(`${location.origin}/projects/${section.projectId}#section-${section.id}`)}>
              <LinkIcon /> Copy link to section
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void runAction({ isArchived: true })}><Archive /> Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete section "${section.name}"? Its tasks will be deleted too.`)) onDelete(section);
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
