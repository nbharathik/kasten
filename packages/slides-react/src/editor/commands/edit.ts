import { clipboardPictures } from "../gallery/files.ts";
import { selectAllHere } from "../select-all/select-all.ts";
import { insertImageFiles } from "./insert.ts";
import type { Command } from "./types.ts";

const hasSelection = (s: { selection: readonly string[] }) => s.selection.length > 0;

/** Undo, redo and the clipboard. */
export const editCommands: Command[] = [
  {
    id: "edit.undo",
    label: "Undo",
    icon: "undo-2",
    keys: ["Mod+Z"],
    scope: "global",
    enabled: (s) => s.canUndo,
    run: ({ session }) => session.undo(),
  },
  {
    id: "edit.redo",
    label: "Redo",
    icon: "redo-2",
    keys: ["Mod+Shift+Z", "Mod+Y"],
    scope: "global",
    enabled: (s) => s.canRedo,
    run: ({ session }) => session.redo(),
  },
  {
    id: "edit.cut",
    label: "Cut",
    icon: "scissors",
    keys: ["Mod+X"],
    scope: "canvas",
    enabled: hasSelection,
    run: async ({ session }) => {
      const text = session.clipboard.cut();
      if (text) await navigator.clipboard?.writeText(text).catch(() => {});
    },
  },
  {
    id: "edit.copy",
    label: "Copy",
    icon: "copy",
    keys: ["Mod+C"],
    scope: "canvas",
    enabled: hasSelection,
    run: async ({ session }) => {
      const text = session.clipboard.copy();
      if (text) await navigator.clipboard?.writeText(text).catch(() => {});
    },
  },
  {
    id: "edit.paste",
    label: "Paste",
    icon: "clipboard-paste",
    keys: ["Mod+V"],
    scope: "canvas",
    run: async (context) => {
      // A picture on the clipboard (a screenshot) is kept and placed; anything else pastes as it did.
      const pictures = await clipboardPictures();
      if (pictures.length > 0) return insertImageFiles(context, pictures, { source: "pasted" });
      const text = await navigator.clipboard?.readText().catch(() => undefined);
      context.session.clipboard.paste(text);
    },
  },
  {
    id: "edit.duplicate",
    label: "Duplicate",
    icon: "copy-plus",
    keys: ["Mod+D"],
    scope: "canvas",
    enabled: hasSelection,
    run: ({ session }) => session.elements.duplicate(),
  },
  {
    id: "edit.delete",
    label: "Delete",
    icon: "trash",
    keys: ["Delete", "Backspace"],
    scope: "canvas",
    enabled: hasSelection,
    run: ({ session }) => session.elements.remove(),
  },
  {
    id: "edit.select-all",
    label: "Select all",
    keys: ["Mod+A"],
    scope: "canvas",
    // Where the person is decides what it takes: the words of an open text box, the elements of the slide, the slides of the
    // filmstrip or the grid, the text of the outline or of a panel.
    run: (context) => selectAllHere(context),
  },
  {
    id: "edit.find",
    label: "Find and replace",
    icon: "replace",
    keys: ["Mod+F", "Mod+H"],
    scope: "global",
    run: ({ ui }) => ui.openDialog("find"),
  },
];
