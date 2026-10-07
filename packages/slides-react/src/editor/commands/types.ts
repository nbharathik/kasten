import type { EditorSession } from "../session/session.ts";
import type { EditorState } from "../session/types.ts";
import type { EditorUi, UiState } from "../ui-state.ts";
import type { IconName } from "../ui/icons.ts";

/** What a command can see and change. */
export interface CommandContext {
  session: EditorSession;
  ui: EditorUi;
}

/**
 * Where a key applies. A command bound in "canvas" does nothing while a text box is being typed in. One bound in "stage"
 * is for keys that are letters and nothing else: they work when the slide itself has the keys, and not when a toolbar
 * button, the filmstrip or a panel has them, where a letter is not meant for the slide.
 */
export type KeyScope = "global" | "canvas" | "filmstrip" | "stage";

export interface Command {
  /** Dotted, such as `text.bold` or `slide.new`. */
  id: string;
  label: string;
  icon?: IconName;
  /** Key combinations, such as "Mod+B" or "Mod+Shift+Z"; the first is shown. `Mod` is Ctrl, or Cmd on a Mac. */
  keys?: string[];
  scope?: KeyScope;
  /** Its keys work while a field (the notes, a name) has the focus too. Only for a chord with Ctrl or Cmd, which is never typing. */
  inFields?: boolean;
  /** What its keys do where that is not what a click on its menu item or button does (the click arms a tool, the key adds at once). */
  byKey?(context: CommandContext): void | Promise<void>;
  /** Whether it can be done now; absent means always. */
  enabled?(state: EditorState, ui: UiState): boolean;
  /** For a command that is on or off: whether it is on now. */
  checked?(state: EditorState, ui: UiState): boolean;
  run(context: CommandContext): void | Promise<void>;
}

export type Commands = ReadonlyMap<string, Command>;
