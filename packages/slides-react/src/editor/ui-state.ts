// The editor's own state, the part that is about the window and not the deck:
// which view is shown, which panel is open, the zoom, dialogs, and the paint
// format in hand. Commands change it through these methods, so a menu, a key
// and a button all do the same thing.

import type { PngOptions } from "../export/png.ts";
import type { PrintOptions } from "../export/print.tsx";
import { Areas } from "./select-all/areas.ts";
import type { TextHandle } from "./text-handle.ts";
import { LINT_BADGES_KEY, readFlag, writeFlag } from "./ui-prefs.ts";

export type ViewMode = "edit" | "outline" | "grid";
export type PanelName = "format" | "steps" | "ai" | "comments";
/** A menu opened by a right click, where it was pressed. */
export interface ContextMenuState {
  kind: "element" | "canvas" | "slide";
  x: number;
  y: number;
}

export type DialogName = "find" | "layouts" | "theme" | "background" | "shortcuts" | "transition" | "insert" | "embed" | "video" | "table" | "link" | "export" | "png" | "about" | "import" | "lint" | "citation";

/** Formatting picked up with the paint-format tool, to lay on the next thing clicked. */
export interface PaintFormat {
  run: { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; size?: number; font?: string };
  style?: Record<string, unknown>;
}

export interface UiState {
  readonly view: ViewMode;
  readonly panel: PanelName | null;
  readonly dialog: DialogName | null;
  /** "fit" follows the size of the window; a number is a fixed zoom (1 is 100%). */
  readonly zoom: "fit" | number;
  /** The zoom "fit" comes to at the size of the stage now, reported by the canvas. */
  readonly fitZoom: number;
  readonly notesOpen: boolean;
  readonly snap: boolean;
  readonly filmstripOpen: boolean;
  /** The images drawer, beside the filmstrip. */
  readonly galleryOpen: boolean;
  readonly paint: PaintFormat | null;
  /** The text editor with the caret, while a box is being edited. */
  readonly text: TextHandle | null;
  readonly contextMenu: ContextMenuState | null;
  /** The step of the slide shown on the canvas by the Steps panel or the step keys; null shows the slide as it is styled. */
  readonly previewStep: number | null;
  /** Counts the times the host's actions were replaced, so a region that shows them draws again. */
  readonly actionsRevision: number;
  /** The editor covers the whole window of the app, and nothing of the host's own chrome shows around it. Not part of the deck or the session. */
  readonly fullScreen: boolean;
  /** The filmstrip flags slides that have problems (View, Lint badges). Off unless the person turned it on; kept in this browser. */
  readonly lintBadges: boolean;
}

const INITIAL: UiState = {
  view: "edit",
  panel: null,
  dialog: null,
  zoom: "fit",
  fitZoom: 1,
  notesOpen: true,
  snap: true,
  filmstripOpen: true,
  galleryOpen: false,
  paint: null,
  text: null,
  contextMenu: null,
  previewStep: null,
  actionsRevision: 0,
  fullScreen: false,
  lintBadges: false,
};

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** What the host application gives the editor to call: present, export, and leaving. */
export interface EditorActions {
  /** Presents the deck from its first slide or the one shown; `view: "scroll"` is the whole deck as a page with its notes, `presenter` also opens the presenter's window. */
  present?(from: "start" | "current", options?: { view?: "slides" | "scroll"; presenter?: boolean }): void;
  exportAs?(format: "pptx" | "pdf" | "png" | "markdown" | "html"): void;
  /** Prints the deck (the browser's print dialog, where "Save as PDF" is a destination). */
  print?(options?: PrintOptions): void;
  /** Saves slides as PNG pictures: one file, or a zip file of them. */
  png?(options: PngOptions): void;
  close?(): void;
  /**
   * The editor went into full screen (`on`) or came out: it covers the whole window of the app, with or without this. A host that
   * has more to do (a desktop shell taking its own window full screen) does it here. The browser's Fullscreen API is not used. A host
   * that sees the person leave full screen some other way calls `ui.setFullScreen(false)`.
   */
  fullScreen?(on: boolean): void | Promise<void>;
}

export class EditorUi {
  private current: UiState = { ...INITIAL, lintBadges: readFlag(LINT_BADGES_KEY, false) };
  private readonly listeners = new Set<() => void>();
  private hostActions: EditorActions = {};
  /** Where the focus last was in the editor, and the regions that select all of what they hold: what select all reads. */
  readonly areas = new Areas();

  /** What the host lets the editor do: present, export, print, leave. Set by the editor component; regions read it with `useUiState`. */
  get actions(): EditorActions {
    return this.hostActions;
  }

  set actions(actions: EditorActions) {
    this.hostActions = actions;
    this.patch({ actionsRevision: this.current.actionsRevision + 1 });
  }

  get state(): UiState {
    return this.current;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): UiState => this.current;

  private patch(changes: Partial<UiState>): void {
    this.current = { ...this.current, ...changes };
    for (const listener of [...this.listeners]) listener();
  }

  setView(view: ViewMode): void {
    this.patch({ view });
  }

  /** Opens a panel, or closes it if it is the one open. */
  togglePanel(panel: PanelName): void {
    this.patch({ panel: this.current.panel === panel ? null : panel });
  }

  openPanel(panel: PanelName | null): void {
    this.patch({ panel });
  }

  openDialog(dialog: DialogName | null): void {
    this.patch({ dialog });
  }

  setZoom(zoom: "fit" | number): void {
    this.patch({ zoom: zoom === "fit" ? zoom : Math.min(Math.max(zoom, 0.1), 8) });
  }

  /** Records what "fit" comes to, so the zoom shown and the steps from it are right. */
  setFitZoom(fit: number): void {
    if (Math.abs(fit - this.current.fitZoom) > 0.0005) this.patch({ fitZoom: fit });
  }

  /** The next zoom step above or below the one now. */
  stepZoom(direction: 1 | -1, basis = this.current.fitZoom): void {
    const now = this.current.zoom === "fit" ? basis : this.current.zoom;
    const next = direction > 0 ? ZOOM_STEPS.find((z) => z > now + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < now - 0.001);
    if (next) this.setZoom(next);
  }

  toggleNotes(): void {
    this.patch({ notesOpen: !this.current.notesOpen });
  }

  toggleSnap(): void {
    this.patch({ snap: !this.current.snap });
  }

  toggleFilmstrip(): void {
    this.patch({ filmstripOpen: !this.current.filmstripOpen });
  }

  /** Opens or closes the images drawer; `open` says which, without it the drawer is switched. */
  toggleGallery(open?: boolean): void {
    this.patch({ galleryOpen: open ?? !this.current.galleryOpen });
  }

  setPaint(paint: PaintFormat | null): void {
    this.patch({ paint });
  }

  openContextMenu(menu: ContextMenuState | null): void {
    this.patch({ contextMenu: menu });
  }

  /** Shows the slide on the canvas as it stands at a step (0 is how it appears); null shows it as it is styled again. */
  setPreviewStep(step: number | null): void {
    if (step !== this.current.previewStep) this.patch({ previewStep: step });
  }

  /** Records the text editor that has the caret (null when none has). */
  setText(text: TextHandle | null): void {
    if (text !== this.current.text) this.patch({ text });
  }

  /** Puts the editor over the whole window of the app, or back in its place. The workspace keeps the page and the host told (`watchFullScreen`). */
  setFullScreen(on: boolean): void {
    if (on !== this.current.fullScreen) this.patch({ fullScreen: on });
  }

  toggleFullScreen(): void {
    this.setFullScreen(!this.current.fullScreen);
  }

  /** Shows or hides the lint badges on the filmstrip's slides, and keeps the choice in this browser. */
  setLintBadges(on: boolean): void {
    if (on === this.current.lintBadges) return;
    writeFlag(LINT_BADGES_KEY, on);
    this.patch({ lintBadges: on });
  }

  toggleLintBadges(): void {
    this.setLintBadges(!this.current.lintBadges);
  }
}
