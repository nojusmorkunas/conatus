// "t", "Shift+t", "?", "Enter". Letters compare lower-case, so Caps Lock
// changes nothing, and a held Shift is spelled out.
export function keyName(event: { key: string; shiftKey: boolean }) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return event.shiftKey && /^[a-z]$/.test(key) ? `Shift+${key}` : key;
}

// Keys typed into a field belong to the field.
export function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || element?.closest?.("input, textarea, select"));
}

// Single-key shortcuts stand down while the user types, while a dialog or a
// menu has the keyboard, and during a keyboard drag, where the arrows and Space
// belong to dnd-kit.
export function shortcutsBlocked(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return Boolean(
    event.metaKey || event.ctrlKey || event.altKey || event.isComposing ||
    isTyping(target) ||
    target?.closest?.("[role=dialog], [role=menu]") ||
    document.querySelector("[aria-modal=true], .is-dragging"),
  );
}

export function taskRows() {
  return [...document.querySelectorAll<HTMLElement>("[data-task-id]")]
    .filter((row) => row.offsetParent !== null);
}

// Moves keyboard focus to the task row `step` rows away from `from`, in screen
// order. With nothing focused yet it starts at the first or last row.
export function focusTaskRow(from: Element | null, step: 1 | -1) {
  const rows = taskRows();
  const index = from ? rows.indexOf(from as HTMLElement) : -1;
  const next = index === -1
    ? rows.at(step > 0 ? 0 : -1)
    : rows[Math.min(Math.max(index + step, 0), rows.length - 1)];
  next?.focus();
  return Boolean(next);
}
