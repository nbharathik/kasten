import { create } from "zustand";

import type { SaveState } from "../features/workspace/page/page-session";

interface ShellState {
  sidebarOpen: boolean;
  /** The panes whose page shows the right panel, with its outline and
   * details: each pane has its own. */
  panels: string[];
  /** Hides the sidebar and bars, leaving only the page. */
  focusMode: boolean;
  paletteOpen: boolean;
  /** What the palette's field holds when it opens. */
  paletteQuery: string;
  shortcutsOpen: boolean;
  /** Shows the Markdown file beside the page. */
  sourceOpen: boolean;
  /** How each open page's edits stand, by path. */
  saveStates: Record<string, SaveState>;
  /** The note the "Move to" picker is open for. */
  moving: string | null;
  /** The template gallery, when open: `onPick` fills an empty page instead
   * of making a new one; `select` is the template shown first. */
  /** The template gallery, open on a template, or on the starter kits. */
  gallery: { onPick?: (template: string) => void; select?: string; kits?: boolean } | null;
  /** The chat docked at the right, about the pages open. */
  chatOpen: boolean;
  /** The sidebar's "New project" name field is open. */
  namingProject: boolean;
  toggleSidebar: () => void;
  /** Shows or hides the right panel in a pane. */
  togglePanel: (paneId: string) => void;
  openPanel: (paneId: string) => void;
  toggleFocus: () => void;
  toggleSource: () => void;
  /** Opens or closes the palette; `query` fills its field when it opens. */
  setPalette: (open: boolean, query?: string) => void;
  setShortcuts: (open: boolean) => void;
  setSaveState: (path: string, state: SaveState) => void;
  setMoving: (path: string | null) => void;
  openGallery: (gallery: ShellState["gallery"]) => void;
  toggleChat: (open?: boolean) => void;
  /** Opens the sidebar's field for a new project's name, or closes it. */
  nameProject: (open: boolean) => void;
}

/** UI state for the shell. Derived and disposable: nothing here is content. */
export const useShell = create<ShellState>()((set) => ({
  sidebarOpen: true,
  panels: [],
  focusMode: false,
  paletteOpen: false,
  paletteQuery: "",
  shortcutsOpen: false,
  sourceOpen: false,
  saveStates: {},
  moving: null,
  gallery: null,
  chatOpen: false,
  namingProject: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen, focusMode: false })),
  togglePanel: (paneId) => set((s) => ({ panels: s.panels.includes(paneId) ? s.panels.filter((p) => p !== paneId) : [...s.panels, paneId] })),
  openPanel: (paneId) => set((s) => (s.panels.includes(paneId) ? s : { panels: [...s.panels, paneId] })),
  toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleSource: () => set((s) => ({ sourceOpen: !s.sourceOpen })),
  setPalette: (paletteOpen, paletteQuery = "") => set({ paletteOpen, paletteQuery }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  setSaveState: (path, state) => set((s) => (s.saveStates[path] === state ? s : { saveStates: { ...s.saveStates, [path]: state } })),
  setMoving: (moving) => set({ moving }),
  openGallery: (gallery) => set({ gallery }),
  toggleChat: (open) => set((s) => ({ chatOpen: open ?? !s.chatOpen })),
  nameProject: (open) => set(open ? { namingProject: true, sidebarOpen: true, focusMode: false } : { namingProject: false }),
}));
