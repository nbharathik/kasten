// Full screen for the editor: the editor covers the whole window of the app it runs in (`ui.state.fullScreen`, which the workspace draws
// as `is-fullscreen`), with nothing of the host's own chrome around it. It is not the monitor's full screen: the browser's Fullscreen
// API is not used (see the README). A host that wants more, such as a desktop shell taking its own window full screen, gives
// `ui.actions.fullScreen`; the editor covers the window with or without it.

import type { EditorUi } from "./ui-state.ts";

/** Set on the page's body while an editor is in full screen, so a host can hide the parts of its own window around it. */
export const FULL_SCREEN_ATTRIBUTE = "data-ks-fullscreen";

/** The editors in full screen now. The page stays marked until the last of them is out. */
const active = new Set<EditorUi>();

/** Runs something the host may refuse, whether it throws or answers with a rejection. */
function attempt(run: () => unknown): void {
  try {
    void Promise.resolve(run()).catch(() => {});
  } catch {
    // The host could not: the editor still covers the window.
  }
}

/** Where Escape belongs to what has the focus: a field, a menu or a dialog use it to cancel first. */
const USES_ESCAPE = "input, textarea, select, [contenteditable='true'], .ks-popover, .ks-scrim";
/** A modal window anywhere on the page, the host's too (a palette, a picker): Escape closes it, wherever the focus is. */
const MODAL = "[aria-modal='true']";

/**
 * Keeps what depends on the mode in step with it until the returned function is called:
 * - the body carries `data-ks-fullscreen` while any editor is in full screen;
 * - the host's `ui.actions.fullScreen` is told `true` when the mode goes on and `false` when it goes off;
 * - Escape leaves the mode when nothing else took it (the slide cancels a drag, an edit, a step preview, the tool and the selection
 *   first; a field, a menu or a dialog use it for themselves), wherever in the page the focus is;
 * - stopping the watch, when the editor goes away, leaves the mode.
 */
export function watchFullScreen(ui: EditorUi, doc: Document = document): () => void {
  /** What the mode last was here, so a change is acted on once. */
  let on = false;
  /** The host was told the mode went on, so it is told when it goes off. */
  let told = false;

  const mark = (yes: boolean): void => {
    if (yes) active.add(ui);
    else active.delete(ui);
    if (active.size > 0) doc.body.setAttribute(FULL_SCREEN_ATTRIBUTE, "true");
    else doc.body.removeAttribute(FULL_SCREEN_ATTRIBUTE);
  };

  const apply = (): void => {
    const next = ui.state.fullScreen;
    if (next === on) return;
    on = next;
    mark(next);
    if (next) {
      const host = ui.actions.fullScreen;
      told = host !== undefined;
      if (host) attempt(() => host(true));
    } else {
      if (told) attempt(() => ui.actions.fullScreen?.(false));
      told = false;
    }
  };

  const escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !ui.state.fullScreen) return;
    if (event.target instanceof Element && event.target.closest(USES_ESCAPE)) return;
    if (doc.querySelector(MODAL)) return;
    event.preventDefault();
    ui.setFullScreen(false);
  };

  doc.addEventListener("keydown", escape);
  const unsubscribe = ui.subscribe(apply);
  apply();

  return () => {
    // Through the subscription, so the host is told and the body is unmarked.
    if (ui.state.fullScreen) ui.setFullScreen(false);
    unsubscribe();
    doc.removeEventListener("keydown", escape);
  };
}
