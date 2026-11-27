import { subtreeIds } from "@/lib/task-tree";

import type { JsonObject } from "./merge";
import type { OfflineStore, Tx } from "./store";
import { keyAfter, newLocalId, placeKey, queueChange } from "./support";
import type { LabelEntity, ProjectEntity, SectionEntity } from "./types";

/**
 * Writes to projects, sections and labels, which work like task writes: the local copy first, then
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
      tx.projects.upsert([{ ...project, isFavorite: favorite }]);
      queueChange(tx, "Project", project.id, "Update", { isFavorite: favorite }, `Favourite “${project.name}”`);
    });
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

  /** Deletes a label and takes it off every task that has it. */
  deleteLabel(label: LabelEntity) {
    this.write((tx) => {
      tx.tasks.upsert(tx.tasks.all().filter((task) => task.labelIds.includes(label.id)).map((task) => ({ ...task, labelIds: task.labelIds.filter((id) => id !== label.id) })));
      tx.labels.delete([label.id]);
      queueChange(tx, "Label", label.id, "Delete", {}, `Delete the label “${label.name}”`);
    });
  }
}

