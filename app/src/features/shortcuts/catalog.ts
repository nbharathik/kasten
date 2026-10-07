// The commands keys can run, in the order Settings and the shortcut sheet
// list them.

import { COMMANDS } from "../workspace/overlays/commands";
import { isMac } from "./keymap";

/** Commands only keys run; the palette has no row for them. */
const KEY_ONLY: Record<string, string> = {
  palette: "Search and commands",
  back: "Back",
  forward: "Forward",
  "next-tab": "Next tab",
  "prev-tab": "Previous tab",
};

export const KEY_SECTIONS: { title: string; ids: string[] }[] = [
  {
    title: "Anywhere",
    ids: ["palette", "new-page", "new-card", "journal", "prev-day", "next-day", "search", "chat-dock", "back", "forward", "sidebar", "panel", "page-history", "focus", "theme", "zoom-in", "zoom-out", "zoom-reset", "save", "shortcuts"],
  },
  { title: "Tabs and panes", ids: ["new-tab", "close-tab", "reopen-tab", "pin-tab", "next-tab", "prev-tab", "split", "stack", "stack-page"] },
  { title: "Go to", ids: ["home", "inbox", "journal-page", "library", "tasks", "calendar", "tags", "boards", "highlights", "chat", "history", "review", "trash", "settings"] },
  { title: "Make and change", ids: ["templates", "kits", "new-project", "new-board", "import-pdf", "import-notes", "rename-page", "lock-page", "move", "duplicate", "favourite-page", "copy-link", "copy-markdown", "reveal-page", "trash-page", "markdown", "full-width", "print"] },
];

/** A command's name as the palette shows it. */
export function commandLabel(id: string): string {
  return KEY_ONLY[id] ?? COMMANDS.find((c) => c.id === id)?.label ?? id;
}

/** Keys the page editor uses, written for this system: ⌘ and ⌥ on macOS. */
export function editorKeys(text: string): string {
  return isMac() ? text.replace(/Ctrl\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧") : text;
}
