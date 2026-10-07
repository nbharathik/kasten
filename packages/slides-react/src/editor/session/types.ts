import type { Deck } from "@kasten-slides/wasm";

/**
 * What a click or drag on the slide does.
 * `select`; `text` draws a text box; `shape:<preset>` draws a shape;
 * `line:<route>` and `arrow:<route>` draw a line, straight, elbow or curved.
 */
export type Tool = "select" | "text" | `shape:${string}` | `line:${string}` | `arrow:${string}`;

/** Where saving stands. */
export type SaveState =
  | { status: "saved" }
  | { status: "unsaved" }
  | { status: "saving" }
  | { status: "error"; message: string }
  /** The file changed on disk while the deck had unsaved changes. `theirs` is what is there. */
  | { status: "conflict"; theirs: string; copy?: string | null };

/** Everything a view needs to draw the editor. A new object after every change. */
export interface EditorState {
  readonly deck: Deck;
  /** The slide on the canvas. */
  readonly slideId: string;
  /** Element ids selected on that slide, top level only. */
  readonly selection: readonly string[];
  /** Slide ids selected in the filmstrip; always holds `slideId`. */
  readonly slideSelection: readonly string[];
  /** The element whose text is being edited. */
  readonly editing: string | null;
  readonly tool: Tool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  readonly saving: SaveState;
  /** Counts changes to the deck, so a view can tell an edit from a re-render. */
  readonly revision: number;
}

/** A place on the slide, in slide units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
