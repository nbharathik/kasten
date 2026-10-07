// Keys a view takes from the whole window (the calendar's, triage's, the
// reader's): never keys typed into a field, keys something else already
// took, or keys meant for another pane.

/** Whether keys typed at `target` go into a field or an editor. */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Whether a key pressed in the window is free for a view to take. */
export function freeKey(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.isComposing && !typingIn(event.target);
}

/** Whether `el` sits in the pane keys act on: the focused one, or the only one. */
export function inFocusedPane(el: HTMLElement | null): boolean {
  if (!el?.isConnected) return false;
  const pane = el.closest(".kasten-pane");
  return !pane || pane.classList.contains("is-focused") || document.querySelectorAll(".kasten-pane").length === 1;
}
