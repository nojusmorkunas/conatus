import { describe, expect, test, vi } from "vitest";

import { filterEntity, labelEntity, projectEntity, sectionEntity, taskEntity } from "./fixtures";
import { ListWrites } from "./list-writes";
import { OfflineStore, pendingChanges } from "./store";

function setup() {
  const store = new OfflineStore();
  const requestSync = vi.fn();
  const writes = new ListWrites(store, requestSync);
  const snapshot = () => store.getSnapshot();
  const queue = () => pendingChanges(snapshot());
  return { store, writes, requestSync, snapshot, queue };
}

describe("projects", () => {
  test("create adds a local project at the end and queues it with a key", () => {
    const { store, writes, snapshot, queue, requestSync } = setup();
    store.transaction((tx) => tx.projects.upsert([projectEntity({ id: "a", order: "a3" }), projectEntity({ id: "theirs", order: "z9", shared: true })]));
    const project = writes.createProject(" Trip ", "blue", null, "a");
    expect(snapshot().projects.get(project.id)).toMatchObject({ name: "Trip", color: "blue", parentId: "a", order: "a4" });
    expect(project.id.startsWith("local:")).toBe(true);
    expect(queue()).toMatchObject([{ id: project.id, target: "Project", kind: "Create", idempotencyKey: expect.any(String), summary: "Add the project “Trip”" }]);
    expect(JSON.parse(queue()[0].body)).toEqual({ name: "Trip", color: "blue", parentId: "a" });
    expect(requestSync).toHaveBeenCalled();
  });

  test("edit sends only what changed, and nothing when nothing did", () => {
    const { store, writes, snapshot, queue } = setup();
    const project = projectEntity({ icon: "🏠" });
    store.transaction((tx) => tx.projects.upsert([project]));
    writes.editProject(project, "Home", "gray", "🏠", null);
    expect(queue()).toEqual([]);
    writes.editProject(project, "House", "gray", null, null);
    expect(snapshot().projects.get("p")).toMatchObject({ name: "House", icon: null });
    expect(JSON.parse(queue()[0].body)).toEqual({ name: "House", icon: null });
  });

  test("favorite and archive", () => {
    const { store, writes, snapshot, queue } = setup();
    const project = projectEntity();
    store.transaction((tx) => tx.projects.upsert([project, projectEntity({ id: "sub", parentId: "p" })]));
    writes.favoriteProject(project, true);
    writes.archiveProject(snapshot().projects.get("p")!, true);
    expect(snapshot().projects.get("p")).toMatchObject({ isFavorite: true, isArchived: true });
    // The server archives only that project.
    expect(snapshot().projects.get("sub")!.isArchived).toBe(false);
    expect(queue().map((change) => JSON.parse(change.body))).toEqual([{ isFavorite: true }, { isArchived: true }]);
    expect(queue()[1].summary).toBe("Archive “Home”");
    writes.archiveProject(snapshot().projects.get("p")!, false);
    expect(JSON.parse(queue()[2].body)).toEqual({ isArchived: false });
  });

  test("delete sends the project and its sub-projects to Trash, restore brings them all back", () => {
    const { store, writes, snapshot, queue } = setup();
    store.transaction((tx) =>
      tx.projects.upsert([
        projectEntity({ id: "p" }),
        projectEntity({ id: "sub", parentId: "p" }),
        projectEntity({ id: "subsub", parentId: "sub" }),
        projectEntity({ id: "earlier", parentId: "p", deletedAt: "2026-10-01T00:00:00.000Z" }),
        projectEntity({ id: "other" }),
      ]),
    );
    writes.deleteProject(snapshot().projects.get("p")!);
    for (const id of ["p", "sub", "subsub", "earlier"]) expect(snapshot().projects.get(id)!.deletedAt).toEqual(expect.any(String));
    expect(snapshot().projects.get("other")!.deletedAt).toBeNull();
    expect(snapshot().projects.get("earlier")!.deletedAt).toBe(snapshot().projects.get("p")!.deletedAt);
    expect(queue()).toMatchObject([{ id: "p", kind: "Delete", target: "Project" }]);

    writes.restoreProject(snapshot().projects.get("p")!);
    for (const id of ["p", "sub", "subsub", "earlier"]) expect(snapshot().projects.get(id)!.deletedAt).toBeNull();
    expect(queue().map((change) => change.kind)).toEqual(["Delete", "Restore"]);
  });
});

describe("project placement", () => {
  const seed = (store: OfflineStore) =>
    store.transaction((tx) =>
      tx.projects.upsert([
        projectEntity({ id: "a", order: "a0" }),
        projectEntity({ id: "b", order: "a1" }),
        projectEntity({ id: "c", order: "a2" }),
        projectEntity({ id: "child", parentId: "a", order: "a0" }),
        projectEntity({ id: "theirs", order: "a1V", shared: true }),
        projectEntity({ id: "gone", order: "a1G", deletedAt: "2026-10-01T00:00:00.000Z" }),
      ]),
    );

  test("place puts a project after a sibling and sends the parent only when it changed", () => {
    const { store, writes, snapshot, queue } = setup();
    seed(store);
    writes.placeProject(snapshot().projects.get("c")!, null, "a");
    const moved = snapshot().projects.get("c")!;
    expect(moved.parentId).toBeNull();
    expect(moved.order > "a0" && moved.order < "a1").toBe(true);
    expect(JSON.parse(queue()[0].body)).toEqual({ afterId: "a" });
    expect(queue()[0]).toMatchObject({ target: "Project", kind: "Update", summary: "Move the project “Home”" });
  });

  test("place under another project, first among its sub-projects", () => {
    const { store, writes, snapshot, queue } = setup();
    seed(store);
    writes.placeProject(snapshot().projects.get("b")!, "a", null);
    const moved = snapshot().projects.get("b")!;
    expect(moved).toMatchObject({ parentId: "a" });
    expect(moved.order < "a0").toBe(true);
    expect(JSON.parse(queue()[0].body)).toEqual({ parentId: "a", afterId: null });
  });

  test("pinning puts a project last among the pinned, and place reorders them", () => {
    const { store, writes, snapshot, queue } = setup();
    seed(store);
    writes.favoriteProject(snapshot().projects.get("a")!, true);
    writes.favoriteProject(snapshot().projects.get("c")!, true);
    writes.favoriteProject(snapshot().projects.get("b")!, true);
    const key = (id: string) => snapshot().projects.get(id)!.favoriteOrder!;
    expect(key("a") < key("c") && key("c") < key("b")).toBe(true);
    writes.placeFavorite(snapshot().projects.get("b")!, null);
    expect(key("b") < key("a")).toBe(true);
    writes.placeFavorite(snapshot().projects.get("b")!, "a");
    expect(key("a") < key("b") && key("b") < key("c")).toBe(true);
    expect(queue().slice(3).map((change) => JSON.parse(change.body))).toEqual([{ favoriteAfterId: null }, { favoriteAfterId: "a" }]);
  });

  test("a pinned project without a place of its own is ordered by its project order", () => {
    const { store, writes, snapshot } = setup();
    store.transaction((tx) => tx.projects.upsert([projectEntity({ id: "a", order: "a0", isFavorite: true }), projectEntity({ id: "b", order: "a5", isFavorite: true }), projectEntity({ id: "c", order: "a9" })]));
    writes.placeFavorite(snapshot().projects.get("c")!, "a");
    const order = snapshot().projects.get("c")!.favoriteOrder!;
    expect(order > "a0" && order < "a5").toBe(true);
  });
});

describe("sections", () => {
  test("create goes after the project's last section", () => {
    const { store, writes, snapshot, queue } = setup();
    store.transaction((tx) => tx.sections.upsert([sectionEntity({ id: "s1", order: "a2" }), sectionEntity({ id: "elsewhere", projectId: "q", order: "a9" })]));
    const section = writes.createSection("p", "Later");
    expect(snapshot().sections.get(section.id)).toMatchObject({ projectId: "p", name: "Later", order: "a3" });
    expect(JSON.parse(queue()[0].body)).toEqual({ projectId: "p", name: "Later" });
    expect(queue()[0]).toMatchObject({ target: "Section", kind: "Create", idempotencyKey: expect.any(String) });
  });

  test("rename, archive and place", () => {
    const { store, writes, snapshot, queue } = setup();
    const a = sectionEntity({ id: "a", order: "a0" });
    const b = sectionEntity({ id: "b", order: "a1" });
    const c = sectionEntity({ id: "c", order: "a2" });
    store.transaction((tx) => tx.sections.upsert([a, b, c]));
    writes.renameSection(a, "Soon");
    writes.renameSection(a, "Later");
    writes.archiveSection(b, true);
    writes.placeSection(c, "a");
    expect(snapshot().sections.get("a")!.name).toBe("Soon");
    expect(snapshot().sections.get("b")!.isArchived).toBe(true);
    const order = snapshot().sections.get("c")!.order;
    expect(order > "a0" && order < "a1").toBe(true);
    expect(queue().map((change) => JSON.parse(change.body))).toEqual([{ name: "Soon" }, { isArchived: true }, { afterId: "a" }]);
  });

  test("delete sends its tasks to Trash, out of the section, and keeps tasks that were already there trashed", () => {
    const { store, writes, snapshot, queue } = setup();
    const section = sectionEntity({ id: "s" });
    store.transaction((tx) => {
      tx.sections.upsert([section, sectionEntity({ id: "keep", order: "a1" })]);
      tx.tasks.upsert([
        taskEntity({ id: "t1", sectionId: "s" }),
        taskEntity({ id: "t2", sectionId: "s", parentId: "t1" }),
        taskEntity({ id: "t3", sectionId: "s", deletedAt: "2026-10-01T00:00:00.000Z" }),
        taskEntity({ id: "t4", sectionId: "keep" }),
      ]);
    });
    writes.deleteSection(section);
    const tasks = snapshot().tasks;
    expect(tasks.get("t1")).toMatchObject({ sectionId: null, deletedAt: expect.any(String) });
    expect(tasks.get("t2")).toMatchObject({ sectionId: null, deletedAt: expect.any(String) });
    expect(tasks.get("t3")).toMatchObject({ sectionId: null, deletedAt: "2026-10-01T00:00:00.000Z" });
    expect(tasks.get("t4")).toMatchObject({ sectionId: "keep", deletedAt: null });
    expect(snapshot().sections.has("s")).toBe(false);
    expect(queue()).toMatchObject([{ id: "s", target: "Section", kind: "Delete" }]);
  });
});

describe("labels", () => {
  test("create, edit", () => {
    const { store, writes, snapshot, queue } = setup();
    store.transaction((tx) => tx.labels.upsert([labelEntity({ id: "x", order: "a1" })]));
    const label = writes.createLabel("urgent", "red");
    expect(snapshot().labels.get(label.id)).toMatchObject({ name: "urgent", color: "red", order: "a2" });
    writes.editLabel(label, "urgent", "red");
    writes.editLabel(label, "later", "red");
    expect(queue().map((change) => [change.kind, JSON.parse(change.body)])).toEqual([["Create", { name: "urgent", color: "red" }], ["Update", { name: "later" }]]);
  });

  test("pin and unpin", () => {
    const { store, writes, snapshot, queue } = setup();
    const label = labelEntity({ id: "x" });
    store.transaction((tx) => tx.labels.upsert([label]));
    writes.favoriteLabel(label, true);
    expect(snapshot().labels.get("x")!.isFavorite).toBe(true);
    writes.favoriteLabel(snapshot().labels.get("x")!, false);
    expect(snapshot().labels.get("x")!.isFavorite).toBe(false);
    expect(queue().map((change) => [change.summary, JSON.parse(change.body)])).toEqual([["Pin the label “errand”", { isFavorite: true }], ["Unpin the label “errand”", { isFavorite: false }]]);
  });

  test("delete takes the label off every task", () => {
    const { store, writes, snapshot, queue } = setup();
    const label = labelEntity({ id: "x" });
    store.transaction((tx) => {
      tx.labels.upsert([label, labelEntity({ id: "y", order: "a1" })]);
      tx.tasks.upsert([taskEntity({ id: "t1", labelIds: ["x", "y"] }), taskEntity({ id: "t2", labelIds: ["x"] }), taskEntity({ id: "t3", labelIds: ["y"] })]);
    });
    writes.deleteLabel(label);
    expect(snapshot().labels.has("x")).toBe(false);
    expect(["t1", "t2", "t3"].map((id) => snapshot().tasks.get(id)!.labelIds)).toEqual([["y"], [], ["y"]]);
    expect(queue()).toMatchObject([{ id: "x", target: "Label", kind: "Delete" }]);
  });
});

describe("filters", () => {
  test("create adds a local filter at the end and queues name and query", () => {
    const { store, writes, snapshot, queue } = setup();
    store.transaction((tx) => tx.filters.upsert([filterEntity({ id: "x", order: "a1" })]));
    const filter = writes.createFilter(" Soon ", " today & p1 ");
    expect(snapshot().filters.get(filter.id)).toMatchObject({ name: "Soon", query: "today & p1", isFavorite: false, order: "a2" });
    expect(queue()).toMatchObject([{ id: filter.id, target: "Filter", kind: "Create", idempotencyKey: expect.any(String) }]);
    expect(JSON.parse(queue()[0].body)).toEqual({ name: "Soon", query: "today & p1" });
  });

  test("edit sends only what changed, and nothing when nothing did", () => {
    const { store, writes, snapshot, queue } = setup();
    const filter = filterEntity();
    store.transaction((tx) => tx.filters.upsert([filter]));
    writes.editFilter(filter, "Urgent", "p1");
    expect(queue()).toEqual([]);
    writes.editFilter(filter, "Urgent", "p1 | p2");
    writes.editFilter(snapshot().filters.get("f")!, "Later", "p1 | p2");
    expect(snapshot().filters.get("f")).toMatchObject({ name: "Later", query: "p1 | p2" });
    expect(queue().map((change) => [change.kind, JSON.parse(change.body)])).toEqual([["Update", { query: "p1 | p2" }], ["Update", { name: "Later" }]]);
  });

  test("pin and unpin", () => {
    const { store, writes, snapshot, queue } = setup();
    const filter = filterEntity();
    store.transaction((tx) => tx.filters.upsert([filter]));
    writes.favoriteFilter(filter, true);
    expect(snapshot().filters.get("f")!.isFavorite).toBe(true);
    writes.favoriteFilter(snapshot().filters.get("f")!, false);
    expect(queue().map((change) => JSON.parse(change.body))).toEqual([{ isFavorite: true }, { isFavorite: false }]);
  });

  test("delete removes it and queues the delete", () => {
    const { store, writes, snapshot, queue } = setup();
    const filter = filterEntity();
    store.transaction((tx) => tx.filters.upsert([filter]));
    writes.deleteFilter(filter);
    expect(snapshot().filters.has("f")).toBe(false);
    expect(queue()).toMatchObject([{ id: "f", target: "Filter", kind: "Delete" }]);
  });
});
