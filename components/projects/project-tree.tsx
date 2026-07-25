"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Folder, MoreHorizontal, Users } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/components/ui/toast";
import { TASK_INDENT_WIDTH } from "@/lib/task-tree";
import { ProjectIconPicker, ProjectTile } from "./project-icon-picker";
import type { Project, ProjectDropIndicator } from "./project-types";

export function ProjectRow({
  project,
  count,
  depth = 0,
  treeRow = false,
  favoriteRow = false,
  hasChildren = false,
  hasSubProjects = hasChildren,
  collapsed = false,
  dropIndicator = null,
  onCollapse,
  onChanged,
}: {
  project: Project;
  count?: number;
  depth?: number;
  treeRow?: boolean;
  favoriteRow?: boolean;
  hasChildren?: boolean;
  hasSubProjects?: boolean;
  collapsed?: boolean;
  dropIndicator?: ProjectDropIndicator;
  onCollapse?: () => void;
  onChanged: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const active = pathname === `/projects/${project.id}`;
  const draggable = (treeRow || favoriteRow) && !project.shared && !project.isInbox;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
    disabled: !draggable,
  });

  async function patch(body: Record<string, unknown>) {
    try {
      await api.patch(`/api/projects/${project.id}`, body);
    } catch (error) {
      toastError(error, "Couldn't update the project.");
    } finally {
      onChanged();
    }
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim() && name !== project.name) await patch({ name: name.trim() });
  }

  async function remove() {
    const childMessage = hasSubProjects
      ? " Its sub-projects will move to Trash too."
      : "";
    if (!confirm(`Move "${project.name}" to Trash? You can restore it later.${childMessage}`)) {
      return;
    }
    try {
      await api.delete(`/api/projects/${project.id}`);
    } catch (error) {
      toastError(error, "Couldn't delete the project.");
    } finally {
      onChanged();
    }
  }

  if (renaming) {
    return (
      <form
        onSubmit={submitRename}
        className="py-1 pr-2"
        style={{ paddingLeft: 8 + depth * TASK_INDENT_WIDTH }}
      >
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submitRename}
        />
      </form>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-project-id={treeRow ? project.id : undefined}
      data-project-name={treeRow ? project.name : undefined}
      data-favorite-project-id={favoriteRow ? project.id : undefined}
      data-favorite-project-name={favoriteRow ? project.name : undefined}
      data-sidebar-navigate={draggable ? "" : undefined}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onMouseDown={
        draggable
          ? (event) => {
              // The whole project row is the drag surface.
              // Keep the menu and collapse button independently clickable.
              const control = (event.target as Element).closest?.(
                "button, input, textarea, select",
              );
              if (control && control !== event.currentTarget) return;
              listeners?.onMouseDown?.(event);
            }
          : undefined
      }
      onTouchStart={
        draggable
          ? (event) => {
              const control = (event.target as Element).closest?.(
                "button, input, textarea, select",
              );
              if (control && control !== event.currentTarget) return;
              listeners?.onTouchStart?.(event);
            }
          : undefined
      }
      onClick={(event) => {
        if (!draggable) return;
        // Match TaskRow: navigation is a controlled row click, not an anchor
        // that can receive the trailing click after a drop and abort the PATCH.
        const control = (event.target as Element).closest?.(
          "button, input, a, textarea, select, [role=menuitem]",
        );
        if (control) return;
        router.push(`/projects/${project.id}`);
      }}
      className={cn(
        "group/project relative flex min-h-9 items-center gap-2 rounded-lg border border-transparent py-1 pr-1.5 text-sm transition-all hover:bg-background/65 focus-within:bg-background/65",
        draggable && "touch-pan-y select-none cursor-pointer",
        active && "border-sidebar-border bg-background font-semibold shadow-sm",
        isDragging && "relative z-20 cursor-grabbing opacity-60 shadow-md",
      )}
      style={{
        paddingLeft: 8 + depth * TASK_INDENT_WIDTH,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {dropIndicator?.anchorId === project.id && (
        <span
          aria-hidden
          className="absolute right-2 -bottom-px z-30 h-0.5 rounded-full bg-primary"
          style={{ left: 8 + dropIndicator.depth * TASK_INDENT_WIDTH }}
        />
      )}
      {draggable ? (
        <span className="flex flex-1 items-center gap-2 truncate">
          <ProjectTile icon={project.icon} color={project.color} />
          <span className="truncate">{project.name}</span>
        </span>
      ) : (
        <Link
          href={`/projects/${project.id}`}
          className="flex flex-1 items-center gap-2 truncate"
        >
          <ProjectTile icon={project.icon} color={project.color} />
          <span className="truncate">{project.name}</span>
        </Link>
      )}
      {project.shared && <Users className="size-3.5 text-muted-foreground" />}
      <div className="flex shrink-0 items-center gap-0.5">
        {treeRow && hasChildren && (
          <button
            type="button"
            className="hidden size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex md:group-hover/project:opacity-100 md:group-focus-within/project:opacity-100 dark:hover:bg-background"
            aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
            onClick={onCollapse}
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
        {/* Shared projects belong to someone else: rename/favorite/delete are
            the owner's; leaving happens from the project header. */}
        {!project.isInbox && !project.shared ? (
        <span className="relative flex size-6 shrink-0 items-center justify-center">
          {count !== undefined && count > 0 && (
            <span className="project-task-count absolute inset-0 hidden items-center justify-center text-center text-xs tabular-nums text-muted-foreground transition-opacity md:flex md:group-hover/project:opacity-0 md:group-focus-within/project:opacity-0">
              {count}
            </span>
          )}
          <DropdownMenu onOpenChange={setOptionsOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute inset-0 !min-h-0 hover:bg-background md:opacity-0 md:group-hover/project:opacity-100 md:group-focus-within/project:opacity-100 dark:hover:bg-background"
                aria-label={`More options for ${project.name}`}
              >
                <MoreHorizontal className={cn("hidden md:block", optionsOpen && "max-md:block")} />
                {count !== undefined && count > 0 && (
                  <span className={cn("text-xs tabular-nums text-muted-foreground md:hidden", optionsOpen && "hidden")}>
                    {count}
                  </span>
                )}
              </Button>
            }
          />
          <DropdownMenuContent className="w-52">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="whitespace-nowrap">
                <Folder /> Change icon
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64 p-2">
                <ProjectIconPicker
                  value={project.icon}
                  color={project.color}
                  onChange={(icon) => void patch({ icon })}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() => patch({ isFavorite: !project.isFavorite })}
            >
              {project.isFavorite ? "Unpin it" : "Pin it!"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={remove}>
              Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </span>
        ) : count !== undefined && count > 0 ? (
        <span className="project-task-count min-w-6 text-center text-xs tabular-nums text-muted-foreground transition-opacity md:group-hover/project:opacity-0 md:group-focus-within/project:opacity-0">{count}</span>
        ) : null}
      </div>
    </div>
  );
}

type ProjectTreeNode = {
  project: Project;
  children: ProjectTreeNode[];
};

export function buildProjectTree(projects: Project[]) {
  const visibleIds = new Set(projects.map((project) => project.id));
  const children = new Map<string, Project[]>();
  const roots: Project[] = [];

  for (const project of projects) {
    if (project.shared || !project.parentId || !visibleIds.has(project.parentId)) {
      roots.push(project);
      continue;
    }
    const siblings = children.get(project.parentId) ?? [];
    siblings.push(project);
    children.set(project.parentId, siblings);
  }

  const rendered = new Set<string>();
  function makeNode(project: Project, ancestors = new Set<string>()): ProjectTreeNode {
    rendered.add(project.id);
    const path = new Set(ancestors).add(project.id);
    return {
      project,
      children: (children.get(project.id) ?? [])
        .filter((child) => !path.has(child.id))
        .map((child) => makeNode(child, path)),
    };
  }

  const tree = roots.map((project) => makeNode(project));
  for (const project of projects) {
    if (!rendered.has(project.id)) tree.push(makeNode(project));
  }
  return tree;
}

export function ProjectBranch({
  node,
  counts,
  allProjects,
  activeProjectId,
  dropIndicator,
  onChanged,
  depth = 0,
}: {
  node: ProjectTreeNode;
  counts: Record<string, number>;
  allProjects: Project[];
  activeProjectId: string | null;
  dropIndicator: ProjectDropIndicator;
  onChanged: () => void;
  depth?: number;
}) {
  const hasChildren = node.children.length > 0;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem(`project:${node.project.id}:collapsed`) === "true");
    });
    return () => cancelAnimationFrame(frame);
  }, [node.project.id]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      localStorage.setItem(`project:${node.project.id}:collapsed`, String(!current));
      return !current;
    });
  }

  return (
    <>
      <ProjectRow
        project={node.project}
        count={counts[node.project.id]}
        depth={depth}
        treeRow
        hasChildren={hasChildren}
        hasSubProjects={allProjects.some(
          (project) => !project.shared && project.parentId === node.project.id,
        )}
        collapsed={collapsed}
        dropIndicator={dropIndicator}
        onCollapse={toggleCollapsed}
        onChanged={onChanged}
      />
      {!collapsed && node.project.id !== activeProjectId &&
        node.children.map((child) => (
          <ProjectBranch
            key={child.project.id}
            node={child}
            counts={counts}
            allProjects={allProjects}
            activeProjectId={activeProjectId}
            dropIndicator={dropIndicator}
            onChanged={onChanged}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

export function projectDepth(project: Project, projects: Project[]) {
  const ownProjects = new Map(
    projects
      .filter((candidate) => !candidate.shared)
      .map((candidate) => [candidate.id, candidate]),
  );
  const visited = new Set([project.id]);
  let current = project;
  let depth = 1;

  while (current.parentId && ownProjects.has(current.parentId) && depth < 10) {
    if (visited.has(current.parentId)) return 10;
    visited.add(current.parentId);
    current = ownProjects.get(current.parentId)!;
    depth += 1;
  }
  return depth;
}
