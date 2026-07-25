"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumn,
  ChevronDown,
  CircleHelp,
  Inbox,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelRow } from "@/components/labels/label-sidebar-section";
import { FilterRow } from "@/components/filters/filter-sidebar-section";
import { ReminderBell } from "@/components/reminders/reminder-bell";
import {
  flattenTaskTree,
  projectTaskDepth,
  TASK_INDENT_WIDTH,
} from "@/lib/task-tree";
import { TaskAddForm } from "@/components/tasks/task-add-form";
import { CreateProjectForm } from "./create-project-form";
import { ProfileAvatar } from "./profile-avatar";
import { ProjectTile } from "./project-icon-picker";
import { buildProjectTree, ProjectBranch, ProjectRow } from "./project-tree";
import type { Filter, Label, Project, ProjectDropIndicator } from "./project-types";
import { SidebarGroupHeader, SidebarSearch, ViewLink } from "./sidebar-nav";

export function ProjectSidebar({
  initialProjects,
  initialLabels,
  initialFilters,
  username,
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
  username: string;
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
  const [collapsed, setCollapsed] = useState(false);
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
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);

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
  const fallbackName = username.charAt(0).toUpperCase() + username.slice(1);
  const displayName = userName?.trim() || fallbackName;
  const projectSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem("sidebar:collapsed") === "true");
      setFavoritesExpanded(localStorage.getItem("sidebar:favorites") !== "collapsed");
      setProjectsExpanded(localStorage.getItem("sidebar:projects") !== "collapsed");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

  useEffect(() => {
    function openMobileSidebar() {
      setMobileOpen(true);
    }
    window.addEventListener("sidebar:open", openMobileSidebar);
    return () => window.removeEventListener("sidebar:open", openMobileSidebar);
  }, []);

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

      // Keep the optimistic UI mounted because router.refresh() after every drop can
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
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "project-sidebar invisible fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 -translate-x-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform md:visible md:z-auto md:w-72 md:pb-3",
          mobileOpen && "visible translate-x-0",
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
              onClick={() => {
                if (mobileOpen) setMobileOpen(false);
                else setSidebarCollapsed(true);
              }}
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
          onClick={(event) => {
            // Keep the drawer open for expand, add and overflow-menu actions.
            // Only an actual navigation target should dismiss it.
            const target = event.target as Element;
            const link = target.closest("a");
            const row = target.closest("[data-sidebar-navigate]");
            const control = target.closest(
              "button, input, textarea, select, [role=menuitem]",
            );
            if (link != null || (row != null && control == null)) {
              setMobileOpen(false);
            }
          }}
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
              <ViewLink href="/trash" icon={<Trash2 className="size-4" />}>
                Trash
              </ViewLink>
            </div>
          </div>

          {hasFavorites && (
            <div className="mb-4">
              <SidebarGroupHeader expanded={favoritesExpanded} onClick={() => toggleGroup("favorites")}>
                Pinned
              </SidebarGroupHeader>
              {favoritesExpanded && (
              <div className="relative flex flex-col gap-0.5">
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
                          <ProjectTile icon={activeFavorite.icon} color={activeFavorite.color} />
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
          )}

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
                        <ProjectTile icon={activeProject.icon} color={activeProject.color} />
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
              <p className="px-2 py-1.5 text-xs text-muted-foreground">v0.2.0-beta.1 experimental</p>
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
