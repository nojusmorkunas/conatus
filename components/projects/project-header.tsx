"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Download,
  Ellipsis,
  History,
  LayoutGrid,
  ListTodo,
  Menu,
  MessageSquare,
  Star,
  Users,
  X,
} from "lucide-react";

import type { projects } from "@/lib/db/schema";
import type { SortBy } from "@/lib/task-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectCommentsPanel } from "./project-comments-panel";
import { projectColorTextClass } from "./project-color-dot";
import { ProjectIcon } from "./project-icons";

type Project = typeof projects.$inferSelect;
type Member = { userId: string; username: string; role: "owner" | "editor" };

export function ProjectHeader({
  project,
  role,
  members,
  currentUserId,
  projectCommentCount,
  view,
  sortBy,
  onViewChange,
  onSortChange,
}: {
  project: Project;
  role: "owner" | "editor";
  members: Member[];
  currentUserId: string;
  projectCommentCount: number;
  view: "list" | "board";
  sortBy: SortBy;
  onViewChange: (view: "list" | "board") => void;
  onSortChange: (sort: SortBy) => void;
}) {
  const router = useRouter();
  const [sharingOpen, setSharingOpen] = useState(false);
  const [parentOptions, setParentOptions] = useState<Project[] | null>(null);
  const [parentId, setParentId] = useState(project.parentId ?? "none");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(projectCommentCount);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project.name);
  const isOwner = role === "owner";

  useEffect(() => {
    if (!isOwner || project.isInbox) return;

    void fetch("/api/projects").then(async (response) => {
      if (!response.ok) return;
      const allProjects = (await response.json()) as (Project & { shared?: boolean })[];
      setParentId(
        project.parentId && allProjects.some((candidate) => candidate.id === project.parentId)
          ? project.parentId
          : "none",
      );
      setParentOptions(
        allProjects.filter(
          (candidate) =>
            !candidate.shared &&
            !candidate.isInbox &&
            candidate.id !== project.id &&
            projectDepth(candidate, allProjects) < 3 &&
            !isDescendant(candidate, project.id, allProjects),
        ),
      );
    });
  }, [isOwner, project.id, project.isInbox, project.parentId]);

  async function toggleFavorite() {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !project.isFavorite }),
    });
    router.refresh();
  }

  async function moveProject(value: unknown) {
    if (typeof value !== "string") return;
    const nextParentId = value === "none" ? null : value;
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: nextParentId }),
    });
    if (!response.ok) return;
    setParentId(value);
    router.refresh();
  }

  async function saveName() {
    const nextName = name.trim();
    setEditingName(false);
    if (!nextName || nextName === project.name) {
      setName(project.name);
      return;
    }
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    if (!response.ok) setName(project.name);
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-8 border-b border-border/70 bg-background/95 px-3 pt-3 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8 md:pb-5 lg:-ml-10 lg:pl-10">
      <div className="flex items-start justify-between gap-1 sm:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1 shrink-0 md:hidden"
            aria-label="Open menu"
            onClick={() => window.dispatchEvent(new Event("sidebar:open"))}
          >
            <Menu />
          </Button>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md md:size-11 md:rounded-xl md:border md:border-border md:bg-muted/45 md:shadow-sm">
            <ProjectIcon
              icon={project.icon}
              className={`size-4 md:size-5 ${projectColorTextClass[project.color as keyof typeof projectColorTextClass] ?? projectColorTextClass.gray}`}
            />
          </div>
          <div className="min-w-0">
            {editingName ? (
              <Input
                autoFocus
                aria-label="Project name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveName();
                  if (event.key === "Escape") { setName(project.name); setEditingName(false); }
                }}
                className="h-8 text-2xl font-bold sm:text-[28px]"
              />
            ) : (
              <button
                type="button"
                className="block max-w-full cursor-text select-text truncate text-left text-2xl leading-8 font-bold tracking-tight hover:text-primary sm:text-[28px]"
                onClick={() => { if (!window.getSelection()?.toString()) setEditingName(true); }}
                title="Rename project"
              >
                {project.name}
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1 text-muted-foreground">
          <div className="hidden items-center rounded-lg border border-border bg-muted/40 p-0.5 sm:mr-1 sm:flex">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label="List view"
              onClick={() => onViewChange("list")}
            >
              <ListTodo className="size-3.5" />
              <span className="hidden sm:inline">List</span>
            </Button>
            <Button
              variant={view === "board" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label="Board view"
              onClick={() => onViewChange("board")}
            >
              <LayoutGrid className="size-3.5" />
              <span className="hidden sm:inline">Board</span>
            </Button>
          </div>

          {view === "list" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sort tasks"
              >
                <ArrowUpDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Sort tasks</DropdownMenuLabel>
                  {([
                    ["manual", "Manual"],
                    ["due", "Due date"],
                    ["priority", "Priority"],
                    ["name", "Name"],
                  ] as const).map(([value, label]) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={sortBy === value}
                      onClick={() => onSortChange(value)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
          )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-1.5 text-muted-foreground"
          aria-label="Open project comments"
          onClick={() => setCommentsOpen((open) => !open)}
        >
          <MessageSquare />
          {commentCount > 0 && commentCount}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Project options"
              >
                <Ellipsis />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup className="sm:hidden">
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={view === "list"}
                onClick={() => onViewChange("list")}
              >
                <ListTodo /> List
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={view === "board"}
                onClick={() => onViewChange("board")}
              >
                <LayoutGrid /> Board
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="sm:hidden" />
            {isOwner && !project.isInbox && (
              <DropdownMenuCheckboxItem
                checked={project.isFavorite}
                onClick={toggleFavorite}
              >
                <Star /> Favorite
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuItem onClick={() => setSharingOpen((open) => !open)}>
              <Users /> {isOwner ? "Share" : "View members"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.dispatchEvent(new Event("task-select:toggle"))}
            >
              <ListTodo /> Select tasks
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push(`/projects/${project.id}/activity`)}
            >
              <History /> Activity
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a href={`/api/projects/${project.id}/template`} download />
              }
            >
              <Download /> Save as template
            </DropdownMenuItem>
            {isOwner && !project.isInbox && parentOptions && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move under…</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem
                      checked={parentId === "none"}
                      onClick={() => moveProject("none")}
                    >
                      Top level
                    </DropdownMenuCheckboxItem>
                    {parentOptions.map((parent) => (
                      <DropdownMenuCheckboxItem
                        key={parent.id}
                        checked={parentId === parent.id}
                        onClick={() => moveProject(parent.id)}
                      >
                        {parent.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {sharingOpen && (
        <SharePanel
          projectId={project.id}
          isOwner={isOwner}
          members={members}
          currentUserId={currentUserId}
        />
      )}
      {commentsOpen && (
        <ProjectCommentsPanel
          projectId={project.id}
          projectName={project.name}
          currentUserId={currentUserId}
          onClose={() => setCommentsOpen(false)}
          onCommentCountChange={setCommentCount}
        />
      )}
    </div>
  );
}

function projectDepth(project: Project, projects: Project[]) {
  const byId = new Map(projects.map((candidate) => [candidate.id, candidate]));
  const visited = new Set([project.id]);
  let current = project;
  let depth = 1;

  while (current.parentId && byId.has(current.parentId) && depth < 10) {
    if (visited.has(current.parentId)) return 10;
    visited.add(current.parentId);
    current = byId.get(current.parentId)!;
    depth += 1;
  }
  return depth;
}

function isDescendant(project: Project, ancestorId: string, projects: Project[]) {
  const byId = new Map(projects.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  let parentId = project.parentId;

  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

function SharePanel({
  projectId,
  isOwner,
  members,
  currentUserId,
}: {
  projectId: string;
  isOwner: boolean;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;

    setPending(true);
    setError(null);
    setConfirmation(null);
    const response = await fetch(`/api/projects/${projectId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't add member.");
      return;
    }

    setConfirmation(`Added ${username.trim()}.`);
    setUsername("");
    router.refresh();
  }

  async function remove(userId: string) {
    const response = await fetch(`/api/projects/${projectId}/collaborators`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) return;

    if (userId === currentUserId) {
      router.push("/today");
    }
    router.refresh();
  }

  return (
    <div className="mt-2 w-full max-w-sm rounded-md border border-border p-3 text-sm">
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li key={member.userId} className="flex h-7 items-center gap-2">
            <span className="flex-1 truncate">{member.username}</span>
            {member.role === "owner" ? (
              <span className="text-xs text-muted-foreground">owner</span>
            ) : isOwner ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${member.username}`}
                onClick={() => remove(member.userId)}
              >
                <X />
              </Button>
            ) : member.userId === currentUserId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(member.userId)}
              >
                Leave project
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <Input
            type="text"
            placeholder="Add member by username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            Add
          </Button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {confirmation && (
        <p className="mt-1 text-xs text-muted-foreground">{confirmation}</p>
      )}
    </div>
  );
}
