import { closestCorners, type CollisionDetection, type DropAnimation, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { TaskDropTarget } from "@/lib/task-drop";

/** Sections never compete with rows; tasks target the pointer's insertion gap. */
export const taskCollisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type !== "task") {
    return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((container) => container.data.current?.type === "section") });
  }
  const point = args.pointerCoordinates ?? {
    x: args.collisionRect.left + args.collisionRect.width / 2,
    y: args.collisionRect.top + args.collisionRect.height / 2,
  };
  const groups = args.droppableContainers.filter((container) => container.data.current?.type === "task-group");
  const distance = (id: string | number) => {
    const rect = args.droppableRects.get(id);
    if (!rect || point.x < rect.left - 24 || point.x > rect.right + 24) return Infinity;
    return Math.max(rect.top - point.y, point.y - rect.bottom, 0);
  };
  const group = groups.sort((a, b) => distance(a.id) - distance(b.id))[0];
  if (!group || distance(group.id) > 32) return [];
  const sectionId = group.data.current!.sectionId as string | null;
  const rows = args.droppableContainers
    .filter((container) => container.data.current?.type === "task" && container.data.current.sectionId === sectionId)
    .filter((container) => args.droppableRects.has(container.id))
    .sort((a, b) => args.droppableRects.get(a.id)!.top - args.droppableRects.get(b.id)!.top);
  // Distance to a row's bounds (not its center) keeps tall rows as easy to
  // target as short ones. The half under the pointer selects before/after.
  const row = rows.reduce<typeof rows[number] | undefined>((best, candidate) =>
    !best || distance(candidate.id) < distance(best.id) ? candidate : best, undefined);
  const rect = args.droppableRects.get(row?.id ?? group.id)!;
  const target: TaskDropTarget = {
    sectionId,
    overId: row ? String(row.id) : null,
    edge: point.y < rect.top + rect.height / 2 ? "before" : "after",
  };
  return [{ id: row?.id ?? group.id, data: { value: 0, target } }];
};

export const taskKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const { collisionRect, droppableContainers, droppableRects, active } = context;
  if (!collisionRect || !active) return;
  if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    event.preventDefault();
    const step = context.activeNode ? parseFloat(getComputedStyle(context.activeNode).getPropertyValue("--task-indent-step")) || 28 : 28;
    return { ...currentCoordinates, x: currentCoordinates.x + (event.code === "ArrowRight" ? step : -step) };
  }
  if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return;
  event.preventDefault();
  const down = event.code === "ArrowDown";
  const center = collisionRect.top + collisionRect.height / 2;
  const candidates = droppableContainers.getEnabled().filter((container) => {
    const type = container.data.current?.type;
    if (active.data.current?.type === "section") return type === "section";
    return type === "task" || (type === "task-group" && container.data.current?.empty);
  }).flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return rect ? [{ rect, center: rect.top + rect.height / 2 }] : [];
  }).filter((item) => down ? item.center > center + 5 : item.center < center - 5)
    .sort((a, b) => down ? a.center - b.center : b.center - a.center);
  const next = candidates[0];
  if (next) return {
    x: currentCoordinates.x,
    y: currentCoordinates.y + next.center - center + (down ? 2 : -2),
  };
};

// Animate the full-width overlay wrapper to the newly committed row, including
// its new indentation. Keep the real row hidden only until the overlay lands.
export const taskDropAnimation: DropAnimation = async ({ active, dragOverlay, transform }) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const source = dragOverlay.node.querySelector<HTMLElement>(".task-drag-ghost");
  const destination = active.node.querySelector<HTMLElement>(".task-row") ?? active.node;
  const finalRect = active.node.getBoundingClientRect();
  const depth = getComputedStyle(destination).getPropertyValue("--row-depth");
  const originalOpacity = active.node.style.opacity;
  active.node.style.opacity = "0";
  const animation = dragOverlay.node.animate([
    { transform: CSS.Transform.toString(transform) },
    { transform: CSS.Transform.toString({ ...transform, x: transform.x + finalRect.left - dragOverlay.rect.left, y: transform.y + finalRect.top - dragOverlay.rect.top, scaleX: 1, scaleY: 1 }) },
  ], { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" });
  if (source && depth) {
    source.dataset.settling = "true";
    source.style.setProperty("--row-depth", depth);
  }
  try { await animation.finished; } catch { /* A new drag can interrupt settling. */ }
  finally { active.node.style.opacity = originalOpacity; }
};
