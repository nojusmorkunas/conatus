import { subtreeIds } from "@/lib/task-tree";
import { isVisibleProject } from "@/lib/task-views";

import type { JsonObject } from "./merge";
import type { OfflineStore, Tx } from "./store";
import { keyAfter, newLocalId, placeKey, queueChange } from "./support";
import type { FilterEntity, LabelEntity, ProjectEntity, SectionEntity } from "./types";

const favoriteKey = (project: ProjectEntity) => project.favoriteOrder ?? project.order;

/**
 * Writes to projects, sections, labels and filters, which work like task writes: the local copy first, then
 * the queue. They have no conflict check: the last change to reach the server wins, as renames
 * and colours rarely clash.
 */
export class ListWrites {
  constructor(
    private readonly store: OfflineStore,
    private readonly requestSync: () => void,
  ) {}

  private write<T>(fn: (tx: Tx) => T): T {
    const result = this.store.transaction(fn);
    this.requestSync();
    return result;
  }

  private projectBody = (name: string, color: string, icon: string | null, parentId: string | null): JsonObject => ({
    name: name.trim(),
    color,
    ...(icon ? { icon } : {}),
    ...(parentId ? { parentId } : {}),
  });

  /** A project with all its sub-projects. */
  private subtree(tx: Tx, project: ProjectEntity): ProjectEntity[] {
    const ids = subtreeIds(tx.projects.all(), project.id);
    return tx.projects.all().filter((candidate) => ids.has(candidate.id));
  }

  // Projects

  createProject(name: string, color: string, icon: string | null, parentId: string | null): ProjectEntity {
    return this.write((tx) => {
      // The server numbers a user's own projects, so shared ones don't count.
      const order = keyAfter(tx.projects.all().filter((project) => !project.shared).map((project) => project.order));
      const project: ProjectEntity = { id: newLocalId(), parentId, name: name.trim(), color, icon, isFavorite: false, isInbox: false, order, shared: false, isArchived: false, deletedAt: null };
      tx.projects.upsert([project]);
      queueChange(tx, "Project", project.id, "Create", this.projectBody(name, color, icon, parentId), `Add the project “${project.name}”`);
      return project;
    });
  }

  editProject(project: ProjectEntity, name: string, color: string, icon: string | null, parentId: string | null) {
    const text = name.trim();
    const body: JsonObject = {
      ...(text !== project.name ? { name: text } : {}),
      ...(color !== project.color ? { color } : {}),
      ...(icon !== project.icon ? { icon } : {}),
      ...(parentId !== project.parentId ? { parentId } : {}),
    };
    if (!Object.keys(body).length) return;
    this.write((tx) => {
      tx.projects.upsert([{ ...project, name: text, color, icon, parentId }]);
      queueChange(tx, "Project", project.id, "Update", body, `Edit the project “${project.name}”`);
    });
  }

  favoriteProject(project: ProjectEntity, favorite: boolean) {
    this.write((tx) => {
      // A project newly pinned goes last among the pinned, as on the server.
      const favoriteOrder = favorite && !project.isFavorite ? keyAfter(this.pinned(tx, project).map(favoriteKey)) : project.favoriteOrder;
      tx.projects.upsert([{ ...project, isFavorite: favorite, favoriteOrder }]);
      queueChange(tx, "Project", project.id, "Update", { isFavorite: favorite }, `Favourite “${project.name}”`);
    });
  }

  /** Puts a project under [parentId] (the top when null), right after [afterId] among that parent's projects (first when null). */
  placeProject(project: ProjectEntity, parentId: string | null, afterId: string | null) {
    this.write((tx) => {
      const siblings = tx.projects.all().filter((other) => other.id !== project.id && other.parentId === parentId && !other.shared && isVisibleProject(other));
      tx.projects.upsert([{ ...project, parentId, order: placeKey(siblings, afterId) }]);
      queueChange(tx, "Project", project.id, "Update", { ...(parentId !== project.parentId ? { parentId } : {}), afterId }, `Move the project “${project.name}”`);
    });
  }

  /** Puts a pinned project right after [afterId] among the pinned (first when null). */
  placeFavorite(project: ProjectEntity, afterId: string | null) {
    this.write((tx) => {
      const others = this.pinned(tx, project).map((other) => ({ id: other.id, order: favoriteKey(other) }));
      tx.projects.upsert([{ ...project, favoriteOrder: placeKey(others, afterId) }]);
      queueChange(tx, "Project", project.id, "Update", { favoriteAfterId: afterId }, `Move the pinned project “${project.name}”`);
    });
  }

  /** The other pinned projects: the server orders them by their pinned place, or by their own where they have none. */
  private pinned(tx: Tx, project: ProjectEntity): ProjectEntity[] {
    return tx.projects.all().filter((other) => other.id !== project.id && other.isFavorite && !other.shared && isVisibleProject(other));
  }

  /** Archived projects and their tasks leave every list; the server stops sending them. Sub-projects aren't archived with it. */
  archiveProject(project: ProjectEntity, archived: boolean) {
    this.write((tx) => {
      tx.projects.upsert([{ ...project, isArchived: archived }]);
      queueChange(tx, "Project", project.id, "Update", { isArchived: archived }, `${archived ? "Archive" : "Unarchive"} “${project.name}”`);
    });
  }

  /** Moves a project and its sub-projects to Trash, as the server does; their sections and tasks go with them. */
  deleteProject(project: ProjectEntity) {
    const now = new Date().toISOString();
    this.write((tx) => {
      tx.projects.upsert(this.subtree(tx, project).map((doomed) => ({ ...doomed, deletedAt: now })));
      queueChange(tx, "Project", project.id, "Delete", {}, `Delete the project “${project.name}”`);
    });
  }

  /** Brings a project back from Trash, with its sub-projects. */
  restoreProject(project: ProjectEntity) {
    this.write((tx) => {
      tx.projects.upsert(this.subtree(tx, project).map((back) => ({ ...back, deletedAt: null })));
      queueChange(tx, "Project", project.id, "Restore", {}, `Restore the project “${project.name}”`);
    });
  }

  // Sections

  createSection(projectId: string, name: string): SectionEntity {
    return this.write((tx) => {
      const order = keyAfter(tx.sections.all().filter((section) => section.projectId === projectId).map((section) => section.order));
      const section: SectionEntity = { id: newLocalId(), projectId, name: name.trim(), order, isArchived: false };
      tx.sections.upsert([section]);
      queueChange(tx, "Section", section.id, "Create", { projectId, name: section.name }, `Add the section “${section.name}”`);
      return section;
    });
  }

  renameSection(section: SectionEntity, name: string) {
    const text = name.trim();
    if (text === section.name) return;
    this.write((tx) => {
      tx.sections.upsert([{ ...section, name: text }]);
      queueChange(tx, "Section", section.id, "Update", { name: text }, `Rename the section “${section.name}”`);
    });
  }

  archiveSection(section: SectionEntity, archived: boolean) {
    this.write((tx) => {
      tx.sections.upsert([{ ...section, isArchived: archived }]);
      queueChange(tx, "Section", section.id, "Update", { isArchived: archived }, `${archived ? "Archive" : "Unarchive"} “${section.name}”`);
    });
  }

  /** Puts a section right after [after] (first when null). */
  placeSection(section: SectionEntity, after: string | null) {
    this.write((tx) => {
      const others = tx.sections.all().filter((other) => other.projectId === section.projectId && other.id !== section.id);
      tx.sections.upsert([{ ...section, order: placeKey(others, after) }]);
      queueChange(tx, "Section", section.id, "Update", { afterId: after }, `Move the section “${section.name}”`);
    });
  }

  /** Deletes a section and moves its tasks to Trash, out of the section, as the server does. */
  deleteSection(section: SectionEntity) {
    const now = new Date().toISOString();
    this.write((tx) => {
      const tasks = tx.tasks.all().filter((task) => task.sectionId === section.id);
      tx.tasks.upsert(tasks.map((task) => ({ ...task, sectionId: null, deletedAt: task.deletedAt ?? now })));
      tx.sections.delete([section.id]);
      queueChange(tx, "Section", section.id, "Delete", {}, `Delete the section “${section.name}”`);
    });
  }

  // Labels

  createLabel(name: string, color: string): LabelEntity {
    return this.write((tx) => {
      const label: LabelEntity = { id: newLocalId(), name: name.trim(), color, isFavorite: false, order: keyAfter(tx.labels.all().map((other) => other.order)) };
      tx.labels.upsert([label]);
      queueChange(tx, "Label", label.id, "Create", { name: label.name, color }, `Add the label “${label.name}”`);
      return label;
    });
  }

  editLabel(label: LabelEntity, name: string, color: string) {
    const text = name.trim();
    const body: JsonObject = { ...(text !== label.name ? { name: text } : {}), ...(color !== label.color ? { color } : {}) };
    if (!Object.keys(body).length) return;
    this.write((tx) => {
      tx.labels.upsert([{ ...label, name: text, color }]);
      queueChange(tx, "Label", label.id, "Update", body, `Edit the label “${label.name}”`);
    });
  }

  favoriteLabel(label: LabelEntity, favorite: boolean) {
    this.write((tx) => {
      tx.labels.upsert([{ ...label, isFavorite: favorite }]);
      queueChange(tx, "Label", label.id, "Update", { isFavorite: favorite }, `${favorite ? "Pin" : "Unpin"} the label “${label.name}”`);
    });
  }

  /** Deletes a label and takes it off every task that has it. */
  deleteLabel(label: LabelEntity) {
    this.write((tx) => {
      tx.tasks.upsert(tx.tasks.all().filter((task) => task.labelIds.includes(label.id)).map((task) => ({ ...task, labelIds: task.labelIds.filter((id) => id !== label.id) })));
      tx.labels.delete([label.id]);
      queueChange(tx, "Label", label.id, "Delete", {}, `Delete the label “${label.name}”`);
    });
  }

  // Filters. The server takes no order from the client, so they have no place write.

  createFilter(name: string, query: string): FilterEntity {
    return this.write((tx) => {
      const filter: FilterEntity = { id: newLocalId(), name: name.trim(), query: query.trim(), isFavorite: false, order: keyAfter(tx.filters.all().map((other) => other.order)) };
      tx.filters.upsert([filter]);
      queueChange(tx, "Filter", filter.id, "Create", { name: filter.name, query: filter.query }, `Add the filter “${filter.name}”`);
      return filter;
    });
  }

  editFilter(filter: FilterEntity, name: string, query: string) {
    const text = name.trim();
    const search = query.trim();
    const body: JsonObject = { ...(text !== filter.name ? { name: text } : {}), ...(search !== filter.query ? { query: search } : {}) };
    if (!Object.keys(body).length) return;
    this.write((tx) => {
      tx.filters.upsert([{ ...filter, name: text, query: search }]);
      queueChange(tx, "Filter", filter.id, "Update", body, `Edit the filter “${filter.name}”`);
    });
  }

  favoriteFilter(filter: FilterEntity, favorite: boolean) {
    this.write((tx) => {
      tx.filters.upsert([{ ...filter, isFavorite: favorite }]);
      queueChange(tx, "Filter", filter.id, "Update", { isFavorite: favorite }, `${favorite ? "Pin" : "Unpin"} the filter “${filter.name}”`);
    });
  }

  deleteFilter(filter: FilterEntity) {
    this.write((tx) => {
      tx.filters.delete([filter.id]);
      queueChange(tx, "Filter", filter.id, "Delete", {}, `Delete the filter “${filter.name}”`);
    });
  }
}
