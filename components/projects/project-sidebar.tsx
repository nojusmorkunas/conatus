"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Folder,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeft,
  Plus,
  Search,
  Settings,
  MoreHorizontal,
  Users,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";

import type { filters as filtersTable, labels as labelsTable, projects } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LabelRow } from "@/components/labels/label-sidebar-section";
import { FilterRow } from "@/components/filters/filter-sidebar-section";
import { ReminderBell } from "@/components/reminders/reminder-bell";
import {
  flattenTaskTree,
  projectTaskDepth,
  TASK_INDENT_WIDTH,
} from "@/lib/task-tree";
import { ProjectColorPicker } from "./project-color-picker";
import { ProjectIcon, projectIconPresets } from "./project-icons";
import { TaskAddForm } from "@/components/tasks/task-add-form";

type Project = typeof projects.$inferSelect & { shared?: boolean };
type Label = typeof labelsTable.$inferSelect;
type Filter = typeof filtersTable.$inferSelect;
type ProjectDropIndicator = { anchorId: string | null; depth: number } | null;

export function ProjectSidebar({
  initialProjects,
  initialLabels,
  initialFilters,
  userEmail,
  userName,
  hasAvatar,
  avatarVersion,
  inboxProjectId,
  today,
  labels,
  counts,
  todayCount,
}: {
  initialProjects: Project[];
  initialLabels: Label[];
  initialFilters: Filter[];
  userEmail: string;
  userName: string | null;
  hasAvatar: boolean;
  avatarVersion: string;
  inboxProjectId: string | null;
  today: string;
  labels: { id: string; name: string }[];
  counts: Record<string, number>;
  todayCount: number;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [favoriteLabels, setFavoriteLabels] = useState(initialLabels);
  const [favoriteFilters, setFavoriteFilters] = useState(initialFilters);
  const [creating, setCreating] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("sidebar:collapsed") === "true",
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddError, setQuickAddError] = useState(false);
  const [projectMoveError, setProjectMoveError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFavoriteId, setActiveFavoriteId] = useState<string | null>(null);
  const [favoriteMoveError, setFavoriteMoveError] = useState<string | null>(null);
  const [projectProjection, setProjectProjection] = useState<
    ReturnType<typeof projectTaskDepth>
  >(null);
  const projectProjectionRef = useRef<ReturnType<typeof projectTaskDepth>>(null);
  const [favoritesExpanded, setFavoritesExpanded] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("sidebar:favorites") === "collapsed"
      ? false
      : true,
  );
  const [projectsExpanded, setProjectsExpanded] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("sidebar:projects") === "collapsed"
      ? false
      : true,
  );

  // A shared project can be its owner's Inbox; only my own Inbox is pinned.
  const inbox = projects.find((project) => project.isInbox && !project.shared);
  const rest = projects.filter((project) => project !== inbox);
  const favorites = rest
    .filter((project) => project.isFavorite && !project.shared)
    .sort((a, b) => {
      const aOrder = a.favoriteOrder ?? a.order;
      const bOrder = b.favoriteOrder ?? b.order;
      return aOrder < bOrder ? -1 : 1;
    });
  // Pinned projects remain in the main tree as well, so every owned project
  // can still be reordered and nested from one consistent location.
  const others = rest;
  const projectTree = buildProjectTree(others);
  const flatProjectRows = flattenTaskTree(
    others
      .filter((project) => !project.shared && !project.isInbox)
      .map((project) => ({ ...project, sectionId: null })),
  );
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeFavorite = projects.find((project) => project.id === activeFavoriteId) ?? null;
  const projectDropIndicator: ProjectDropIndicator = projectProjection
    ? {
        anchorId: projectProjection.afterId ?? projectProjection.parentId,
        depth: projectProjection.depth,
      }
    : null;
  const favoriteLabelsOnly = favoriteLabels.filter((label) => label.isFavorite);
  const favoriteFiltersOnly = favoriteFilters.filter((filter) => filter.isFavorite);
  const hasFavorites = favorites.length + favoriteLabelsOnly.length + favoriteFiltersOnly.length > 0;
  const emailPrefix = userEmail.split("@")[0];
  const fallbackName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  const displayName = userName?.trim() || fallbackName;
  const projectSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let active = true;
    async function refreshImportedProjects() {
      const response = await fetch("/api/projects");
      if (active && response.ok) setProjects(await response.json());
    }
    function onProjectsChanged() {
      void refreshImportedProjects();
    }
    window.addEventListener("sidebar:projects:refresh", onProjectsChanged);
    return () => {
      active = false;
      window.removeEventListener("sidebar:projects:refresh", onProjectsChanged);
    };
  }, []);

  function setSidebarCollapsed(value: boolean) {
    setCollapsed(value);
    localStorage.setItem("sidebar:collapsed", String(value));
  }

  useEffect(() => {
    if (!quickAddOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setQuickAddOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [quickAddOpen]);

  async function refresh() {
    const response = await fetch("/api/projects");
    if (response.ok) setProjects(await response.json());
    router.refresh();
  }

  async function refreshFavorites() {
    const [labelsResponse, filtersResponse] = await Promise.all([
      fetch("/api/labels"),
      fetch("/api/filters"),
    ]);
    if (labelsResponse.ok) setFavoriteLabels(await labelsResponse.json());
    if (filtersResponse.ok) setFavoriteFilters(await filtersResponse.json());
    router.refresh();
  }

  function updateProjectProjection(next: ReturnType<typeof projectTaskDepth>) {
    const current = projectProjectionRef.current;
    if (
      current?.depth === next?.depth &&
      current?.parentId === next?.parentId &&
      current?.afterId === next?.afterId
    ) return;
    projectProjectionRef.current = next;
    setProjectProjection(next);
  }

  function dragProjectProjection(
    event: Pick<DragMoveEvent, "active" | "over" | "delta">,
  ) {
    if (!event.over) return null;
    return projectTaskDepth({
      items: flatProjectRows,
      activeId: String(event.active.id),
      overId: String(event.over.id),
      offsetX: event.delta.x,
      // Project levels are 0-based here: 0, 1, 2 = three visible levels.
      maxDepth: 2,
    });
  }

  async function moveProject({ active, over, delta }: DragEndEvent) {
    if (!over) return;
    const moving = projects.find((project) => project.id === active.id);
    const target = projectProjectionRef.current ?? dragProjectProjection({ active, over, delta });
    if (!moving || !target || moving.shared || moving.isInbox) return;

    const parentId = target.parentId;
    const afterId = target.afterId;

    const siblings = projects.filter((project) =>
      project.id !== moving.id && project.parentId === parentId && !project.shared && !project.isInbox,
    ).sort((a, b) => (a.order < b.order ? -1 : 1));
    const afterIndex = afterId ? siblings.findIndex((project) => project.id === afterId) : -1;
    if (afterId && afterIndex < 0) return;
    let order: string;
    try {
      order = generateKeyBetween(
        afterIndex < 0 ? null : siblings[afterIndex].order,
        siblings[afterIndex + 1]?.order ?? null,
      );
    } catch {
      setProjectMoveError("Couldn't calculate that project position. Try again.");
      return;
    }
    const previousProjects = projects;
    setProjectMoveError(null);
    setProjects((current) => current.map((project) =>
      project.id === moving.id ? { ...project, parentId, order } : project,
    ).sort((a, b) => (a.order < b.order ? -1 : 1)));

    try {
      const response = await fetch(`/api/projects/${moving.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, afterId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        setProjects(previousProjects);
        setProjectMoveError(
          typeof body?.error === "string"
            ? body.error
            : "Couldn't move the project. Try again.",
        );
        return;
      }

      // Keep the optimistic UI mounted—router.refresh() after every drop can
      // race a navigation/render and surface a transient Next.js error. Apply
      // the server's canonical fractional order without refreshing the page.
      const updated = await response.json() as Project;
      setProjects((current) => current.map((project) =>
        project.id === updated.id
          ? { ...project, parentId: updated.parentId, order: updated.order }
          : project,
      ).sort((a, b) => (a.order < b.order ? -1 : 1)));
    } catch {
      setProjects(previousProjects);
      setProjectMoveError("Couldn't move the project. Check your connection and try again.");
    }
  }

  async function moveFavoriteProject({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const activeIndex = favorites.findIndex((project) => project.id === active.id);
    const overIndex = favorites.findIndex((project) => project.id === over.id);
    if (activeIndex < 0 || overIndex < 0) return;

    const reordered = arrayMove(favorites, activeIndex, overIndex);
    const movedIndex = reordered.findIndex((project) => project.id === active.id);
    const previous = reordered[movedIndex - 1];
    const next = reordered[movedIndex + 1];
    const moving = reordered[movedIndex];
    let favoriteOrder: string;
    try {
      favoriteOrder = generateKeyBetween(
        previous ? previous.favoriteOrder ?? previous.order : null,
        next ? next.favoriteOrder ?? next.order : null,
      );
    } catch {
      setFavoriteMoveError("Couldn't calculate that favorite position. Try again.");
      return;
    }

    const previousProjects = projects;
    setFavoriteMoveError(null);
    setProjects((current) => current.map((project) =>
      project.id === moving.id ? { ...project, favoriteOrder } : project,
    ));

    try {
      const response = await fetch(`/api/projects/${moving.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteAfterId: previous?.id ?? null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        setProjects(previousProjects);
        setFavoriteMoveError(
          typeof body?.error === "string"
            ? body.error
            : "Couldn't move the favorite. Try again.",
        );
        return;
      }
      const updated = await response.json() as Project;
      setProjects((current) => current.map((project) =>
        project.id === updated.id
          ? { ...project, favoriteOrder: updated.favoriteOrder }
          : project,
      ));
    } catch {
      setProjects(previousProjects);
      setFavoriteMoveError("Couldn't move the favorite. Check your connection and try again.");
    }
  }

  function toggleGroup(group: "favorites" | "projects") {
    const setExpanded = group === "favorites" ? setFavoritesExpanded : setProjectsExpanded;
    setExpanded((expanded) => {
      localStorage.setItem(`sidebar:${group}`, expanded ? "collapsed" : "expanded");
      return !expanded;
    });
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2 md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 -translate-x-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar p-3 transition-transform md:z-auto md:w-72",
          mobileOpen && "translate-x-0",
          collapsed && "md:absolute md:-translate-x-full",
          !collapsed && "md:static md:translate-x-0",
        )}
      >
        <div className="shrink-0" data-testid="sidebar-header">
          <div className="mb-3 flex items-center gap-1">
            <SidebarSearch />
            <ReminderBell />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sidebar"
              onClick={() => setSidebarCollapsed(true)}
            >
              <PanelLeft />
            </Button>
          </div>

          {inboxProjectId && (
            <div className="mb-4 flex h-9 items-center rounded-xl bg-primary text-sm text-primary-foreground shadow-sm transition-colors hover:bg-primary/85">
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 font-semibold"
                onClick={() => {
                  setQuickAddError(false);
                  setQuickAddOpen(true);
                }}
                >
                <Plus className="size-4" />
                New task
              </button>
            </div>
          )}
        </div>

        <div
          onClick={() => setMobileOpen(false)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          data-testid="sidebar-scroll-region"
        >
          <div className="mb-5">
            <p className="mb-1 flex h-8 items-center px-1.5 text-xs font-semibold text-muted-foreground">Navigate</p>
            <div className="flex flex-col gap-0.5 rounded-xl bg-sidebar-accent/45 p-1">
              {inbox && (
                <ViewLink
                  href={`/projects/${inbox.id}`}
                  icon={<Inbox className="size-4" />}
                  count={counts[inbox.id]}
                >
                  Inbox
                </ViewLink>
              )}
              <ViewLink href="/today" icon={<CalendarDays className="size-4" />} count={todayCount}>
                Focus
              </ViewLink>
              <ViewLink href="/calendar" icon={<CalendarRange className="size-4" />}>
                Calendar
              </ViewLink>
              <ViewLink href="/filters-labels" icon={<LayoutGrid className="size-4" />}>
                Organize
              </ViewLink>
            </div>
          </div>

          <div className="mb-4">
            <SidebarGroupHeader expanded={favoritesExpanded} onClick={() => toggleGroup("favorites")}>
              Pinned
            </SidebarGroupHeader>
            {favoritesExpanded && (
              <div className="relative flex flex-col gap-0.5">
                {!hasFavorites && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Use an item&apos;s three-dot menu to pin it here.</p>
                )}
                  <DndContext
                    id="favorite-project-sidebar"
                    sensors={projectSensors}
                    collisionDetection={closestCenter}
                    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                    onDragStart={(event: DragStartEvent) => {
                      setActiveFavoriteId(String(event.active.id));
                    }}
                    onDragEnd={(event) => {
                      setActiveFavoriteId(null);
                      void moveFavoriteProject(event);
                    }}
                    onDragCancel={() => setActiveFavoriteId(null)}
                  >
                    <SortableContext
                      items={favorites.map((project) => project.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {favorites.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          count={counts[project.id]}
                          favoriteRow
                          hasSubProjects={projects.some(
                            (candidate) => !candidate.shared && candidate.parentId === project.id,
                          )}
                          onChanged={refresh}
                        />
                      ))}
                    </SortableContext>
                    <DragOverlay
                      dropAnimation={{
                        duration: 220,
                        easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                      }}
                    >
                      {activeFavorite ? (
                        <div className="flex cursor-grabbing items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm shadow-xl ring-1 ring-black/5">
                          <ProjectTile icon={activeFavorite.icon} />
                          <span className="truncate">{activeFavorite.name}</span>
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                  {favoriteMoveError && (
                    <p role="alert" className="px-2 py-1 text-xs text-destructive">
                      {favoriteMoveError}
                    </p>
                  )}
                  {favoriteLabelsOnly.map((label) => (
                    <LabelRow key={label.id} label={label} onChanged={refreshFavorites} />
                  ))}
                  {favoriteFiltersOnly.map((filter) => (
                    <FilterRow key={filter.id} filter={filter} onChanged={refreshFavorites} />
                  ))}
              </div>
            )}
          </div>

          <div className="flex-1">
            <SidebarGroupHeader
              expanded={projectsExpanded}
              onClick={() => toggleGroup("projects")}
              onAdd={() => {
                setCreating(true);
                if (!projectsExpanded) toggleGroup("projects");
              }}
            >
              Projects
            </SidebarGroupHeader>
            {projectsExpanded && (
              <div className="flex flex-col gap-0.5">
                {others.length === 0 && (
                  <p className="px-2 py-1 text-sm text-muted-foreground">
                    No projects yet.
                  </p>
                )}
                <DndContext
                  id="project-sidebar"
                  sensors={projectSensors}
                  collisionDetection={closestCenter}
                  measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                  onDragStart={(event: DragStartEvent) => {
                    setActiveProjectId(String(event.active.id));
                    updateProjectProjection(null);
                  }}
                  onDragMove={(event) => updateProjectProjection(dragProjectProjection(event))}
                  onDragOver={(event) => updateProjectProjection(dragProjectProjection(event))}
                  onDragEnd={(event) => {
                    setActiveProjectId(null);
                    void moveProject(event);
                    updateProjectProjection(null);
                  }}
                  onDragCancel={() => {
                    setActiveProjectId(null);
                    updateProjectProjection(null);
                  }}
                >
                  {projectDropIndicator?.anchorId === null && (
                    <span
                      aria-hidden
                      className="absolute top-0 right-2 z-30 h-0.5 rounded-full bg-primary"
                      style={{ left: 8 + projectDropIndicator.depth * TASK_INDENT_WIDTH }}
                    />
                  )}
                  <SortableContext items={flatProjectRows.map((project) => project.id)} strategy={verticalListSortingStrategy}>
                    {projectTree.map((node) => (
                      <ProjectBranch
                        key={node.project.id}
                        node={node}
                        counts={counts}
                        allProjects={projects}
                        activeProjectId={activeProjectId}
                        dropIndicator={projectDropIndicator}
                        onChanged={refresh}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay
                    dropAnimation={{
                      duration: 220,
                      easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                    }}
                  >
                    {activeProject ? (
                      <div className="flex cursor-grabbing items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm shadow-xl ring-1 ring-black/5">
                        <ProjectTile icon={activeProject.icon} />
                        <span className="truncate">{activeProject.name}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
                {projectMoveError && (
                  <p role="alert" className="px-2 py-1 text-xs text-destructive">
                    {projectMoveError}
                  </p>
                )}
                {creating ? (
                  <CreateProjectForm
                    projects={projects}
                    onDone={() => setCreating(false)}
                    onCreated={refresh}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-sidebar-border pt-2" data-testid="sidebar-footer">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-2 text-left hover:bg-sidebar-accent"
                />
              }
            >
              <ProfileAvatar displayName={displayName} hasAvatar={hasAvatar} avatarVersion={avatarVersion} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{displayName}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64">
              <DropdownMenuItem onClick={() => router.push("/reporting")}>
                <ChartNoAxesColumn /> Insights &amp; reporting
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings /> Preferences
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings#help")}>
                <CircleHelp /> Help
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut /> Log out
              </DropdownMenuItem>
              <p className="px-2 py-1.5 text-xs text-muted-foreground">v0.1.0 experimental</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {collapsed && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="fixed left-3 top-3 z-30 hidden md:inline-flex"
          aria-label="Open sidebar"
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeft />
        </Button>
      )}

      {quickAddOpen && inboxProjectId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQuickAddOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add task"
            className="w-full max-w-xl rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <TaskAddForm
              projectId={inboxProjectId}
              sectionId={null}
              today={today}
              labels={labels}
              initiallyExpanded
              onCreated={() => {
                setQuickAddOpen(false);
                router.refresh();
              }}
              onError={() => setQuickAddError(true)}
            />
            {quickAddError && <p className="mt-2 text-xs text-destructive">Couldn&apos;t add task.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function SidebarGroupHeader({
  expanded,
  onClick,
  onAdd,
  children,
}: {
  expanded: boolean;
  onClick: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/header mb-1 flex h-8 w-full items-center rounded-lg px-1.5 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50">
      <button
        type="button"
        className="h-full min-w-0 flex-1 text-left"
        onClick={onClick}
      >
        {children}
      </button>
      {onAdd && (
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/header:opacity-100 group-focus-within/header:opacity-100 dark:hover:bg-background"
          aria-label="Add project"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/header:opacity-100 group-focus-within/header:opacity-100 dark:hover:bg-background"
        aria-label={expanded ? `Collapse ${String(children)}` : `Expand ${String(children)}`}
        onClick={onClick}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
    </div>
  );
}

function SidebarSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("search:focus", focus);
    return () => window.removeEventListener("search:focus", focus);
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
      }}
      className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm transition-colors focus-within:bg-sidebar-accent focus-within:ring-1 focus-within:ring-ring"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search"
        aria-label="Search tasks, projects and comments"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
      <kbd className="shrink-0 rounded border border-sidebar-border bg-background/60 px-1.5 text-[10px] font-medium text-muted-foreground">/</kbd>
    </form>
  );
}

function ViewLink({
  href,
  icon,
  count,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors hover:bg-background/70 [&_svg]:text-muted-foreground",
        pathname === href &&
          "bg-background font-semibold shadow-sm ring-1 ring-sidebar-border [&_svg]:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {count !== undefined && count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
    </Link>
  );
}

function ProjectTile({ icon }: { icon: string | null }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden>
      <ProjectIcon icon={icon} className="text-muted-foreground" />
    </span>
  );
}

function ProjectIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1" aria-label="Project icon">
      <button
        type="button"
        aria-label="Default folder icon"
        className={cn(
          "flex size-8 items-center justify-center rounded-md hover:bg-muted",
          value === null && "bg-muted ring-1 ring-border",
        )}
        onClick={() => onChange(null)}
      >
        <Folder className="size-4 text-muted-foreground" />
      </button>
      {projectIconPresets.map(({ value: icon, label, Icon }) => (
        <button
          key={icon}
          type="button"
          aria-label={`Use ${label} icon`}
          title={label}
          className={cn(
            "flex size-8 items-center justify-center rounded-md hover:bg-muted",
            value === icon && "bg-muted ring-1 ring-border",
          )}
          onClick={() => onChange(icon)}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

function ProfileAvatar({
  displayName,
  hasAvatar,
  avatarVersion,
}: {
  displayName: string;
  hasAvatar: boolean;
  avatarVersion: string;
}) {
  if (hasAvatar) {
    return (
      <Image
        src={`/api/account/avatar?v=${avatarVersion}`}
        alt=""
        width={28}
        height={28}
        unoptimized
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pink-500 text-xs font-medium text-white">
      {displayName.charAt(0).toUpperCase()}
    </span>
  );
}

function CreateProjectForm({
  projects,
  onDone,
  onCreated,
}: {
  projects: Project[];
  onDone: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState("gray");
  const [parentId, setParentId] = useState("none");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setPending(true);
    setError(null);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        icon,
        color,
        parentId: parentId === "none" ? null : parentId,
      }),
    });
    setPending(false);

    if (!response.ok) {
      setError("Couldn't create project.");
      return;
    }

    onCreated();
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <Input
        autoFocus
        placeholder="Project name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <ProjectIconPicker value={icon} onChange={setIcon} />
      <ProjectColorPicker value={color} onChange={setColor} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Parent (optional)
        <Select
          value={parentId}
          onValueChange={(value) =>
            setParentId(typeof value === "string" ? value : "none")
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {projects
              .filter(
                (project) =>
                  !project.shared &&
                  !project.isInbox &&
                  projectDepth(project, projects) < 3,
              )
              .map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </label>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ProjectRow({
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
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(false);
    if (name.trim() && name !== project.name) await patch({ name: name.trim() });
  }

  async function remove() {
    const childMessage = hasSubProjects
      ? " Its sub-projects will move to the top level."
      : "";
    if (!confirm(`Delete "${project.name}"? Its sections will be deleted too.${childMessage}`)) {
      return;
    }
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onChanged();
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
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onPointerDown={
        draggable
          ? (event) => {
              // The whole project row is the drag surface.
              // Keep the menu and collapse button independently clickable.
              const control = (event.target as Element).closest?.(
                "button, input, textarea, select",
              );
              if (control && control !== event.currentTarget) return;
              listeners?.onPointerDown?.(event);
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
        draggable && "touch-none cursor-pointer",
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
          <ProjectTile icon={project.icon} />
          <span className="truncate">{project.name}</span>
        </span>
      ) : (
        <Link
          href={`/projects/${project.id}`}
          className="flex flex-1 items-center gap-2 truncate"
        >
          <ProjectTile icon={project.icon} />
          <span className="truncate">{project.name}</span>
        </Link>
      )}
      {project.shared && <Users className="size-3.5 text-muted-foreground" />}
      {treeRow && hasChildren && (
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/project:opacity-100 group-focus-within/project:opacity-100 dark:hover:bg-background"
          aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
          onClick={onCollapse}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
      {/* Shared projects belong to someone else: rename/favorite/delete are
          the owner's; leaving happens from the project header. */}
      {!project.isInbox && !project.shared ? (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 hover:bg-background group-hover/project:opacity-100 group-focus-within/project:opacity-100 dark:hover:bg-background"
                aria-label={`More options for ${project.name}`}
              >
                <MoreHorizontal />
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
                  onChange={(icon) => void patch({ icon })}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() => patch({ isFavorite: !project.isFavorite })}
            >
              {project.isFavorite ? "Remove from favorites" : "Add to favorites"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={remove}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
      {(!project.isInbox && !project.shared) || count !== undefined ? (
        <span className="min-w-6 text-center text-xs tabular-nums text-muted-foreground">{count ?? 0}</span>
      ) : null}
    </div>
  );
}

type ProjectTreeNode = {
  project: Project;
  children: ProjectTreeNode[];
};

function buildProjectTree(projects: Project[]) {
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

function ProjectBranch({
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
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(`project:${node.project.id}:collapsed`) === "true",
  );

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

function projectDepth(project: Project, projects: Project[]) {
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
