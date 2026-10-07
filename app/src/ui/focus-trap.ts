// Tab and Shift+Tab stay inside a modal dialog while it is open, going
// round from its last control to its first, as the WAI-ARIA dialog
// pattern asks. A key an editor or a menu already took is left to it.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

/** Keeps a Tab inside `root`. */
export function keepTabInside(event: KeyboardEvent | { key: string; shiftKey: boolean; defaultPrevented: boolean; preventDefault(): void }, root: HTMLElement | null): void {
  if (event.key !== "Tab" || event.defaultPrevented || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[hidden], [inert]"));
  const active = document.activeElement;
  const outside = !root.contains(active);
  if (items.length === 0) {
    event.preventDefault();
    root.focus();
  } else if (event.shiftKey && (outside || active === items[0] || active === root)) {
    event.preventDefault();
    items.at(-1)!.focus();
  } else if (!event.shiftKey && (outside || active === items.at(-1))) {
    event.preventDefault();
    items[0]!.focus();
  }
}
