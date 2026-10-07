// The desktop app shows its own menus. The webview's menu offers Back,
// Reload and Print, which only take the window away from the app, so it
// shows only where it helps: in text being written (cut, copy, paste,
// spelling) and on selected text (copy). A browser keeps its menu.

import { useEffect } from "react";

import { inTauri } from "../lib/api";

/** Inputs that hold no text to cut or paste. */
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Whether the system's menu suits what a right-click is on. */
export function wantsSystemMenu(event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target?.closest) return false;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") return !NOT_TEXT.has((target as HTMLInputElement).type);
  // The nearest element that says whether its text can be written.
  const host = target.closest("[contenteditable]");
  if (target.isContentEditable || (host && host.getAttribute("contenteditable") !== "false")) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

export function useSystemMenu(): void {
  useEffect(() => {
    if (!inTauri()) return;
    const onMenu = (event: MouseEvent) => {
      if (!event.defaultPrevented && !wantsSystemMenu(event)) event.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);
}
