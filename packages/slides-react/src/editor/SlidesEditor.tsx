import { DeckEngine, loadSlides } from "@kasten-slides/wasm";
import { type JSX, type KeyboardEvent, useEffect, useMemo, useState } from "react";

import { defaultActions } from "./actions.ts";
import { SlideCanvas } from "./canvas/SlideCanvas.tsx";
import { dispatchKey } from "./commands/index.ts";
import { Dialogs } from "./dialogs/Dialogs.tsx";
import { watchFullScreen } from "./full-screen.ts";
import { GridView } from "./grid/GridView.tsx";
import type { SlidesHost } from "./host.ts";
import { ContextMenus } from "./menus/ContextMenus.tsx";
import { MenuBar } from "./menus/MenuBar.tsx";
import { NotesPane } from "./notes/NotesPane.tsx";
import { OutlineView } from "./outline/OutlineView.tsx";
import { Filmstrip } from "./filmstrip/Filmstrip.tsx";
import { GalleryDrawer } from "./gallery/GalleryDrawer.tsx";
import { SidePanel } from "./panels/SidePanel.tsx";
import { EditorSession, type SessionOptions } from "./session/session.ts";
import { TitleBar } from "./titlebar/TitleBar.tsx";
import { Toolbar } from "./toolbar/Toolbar.tsx";
import { EditorUi, type EditorActions } from "./ui-state.ts";
import { useUiState } from "./useUi.ts";
import { useWarmUp } from "./warm-up.ts";
import "./editor.css";
import "./shell.css";

export interface SlidesEditorProps {
  /** The text of the `.deck` file to edit. The editor keeps its own copy from then on; open another deck by giving the editor a new `key`. */
  text: string;
  host: SlidesHost;
  /** What the editor calls when the person asks to present, export or close. */
  actions?: EditorActions;
  /** Called with the editing session when it is ready, and with null when it ends: the host uses it to hand over changes made outside (`receive`). */
  onSession?(session: EditorSession | null, ui: EditorUi | null): void;
  onError?: SessionOptions["onError"];
  /** `light` or `dark`; left out, the system's choice. */
  theme?: "light" | "dark";
  className?: string;
}

/** The whole deck editor: menus, toolbar, filmstrip, the slide, notes and panels. */
export function SlidesEditor({ text, host, actions, onSession, onError, theme, className = "" }: SlidesEditorProps): JSX.Element {
  const [made, setMade] = useState<{ session: EditorSession; ui: EditorUi } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let session: EditorSession | null = null;
    let cancelled = false;
    loadSlides()
      .then(() => {
        if (cancelled) return;
        session = new EditorSession(DeckEngine.open(text), host, { onError });
        const ui = new EditorUi();
        setMade({ session, ui });
        onSession?.(session, ui);
      })
      .catch((error: unknown) => !cancelled && setFailed(error instanceof Error ? error.message : String(error)));
    return () => {
      cancelled = true;
      onSession?.(null, null);
      void session?.dispose();
    };
    // The deck is opened once; a different deck is a different editor.
  }, [host]);

  useEffect(() => {
    if (made) made.ui.actions = { ...defaultActions(made.session, host), ...actions };
  }, [made, actions, host]);

  // The first code block a person opens is not made to wait for the engine's first-use work: it is done once the editor has painted and the page is idle.
  useWarmUp(made !== null);

  const classNames = `ks-editor ${className}`.trim();
  if (failed) {
    return (
      <div className={classNames} data-theme={theme} role="alert">
        <p className="ks-loading">This deck could not be opened: {failed}</p>
      </div>
    );
  }
  if (!made) {
    return (
      <div className={classNames} data-theme={theme}>
        <p className="ks-loading">Opening the deck…</p>
      </div>
    );
  }
  return <Workspace session={made.session} ui={made.ui} className={classNames} theme={theme} />;
}

/** The editor once its session exists. Also the way to show an editor for a session made elsewhere (tests). */
export function Workspace({ session, ui, className = "ks-editor", theme }: { session: EditorSession; ui: EditorUi; className?: string; theme?: "light" | "dark" }): JSX.Element {
  const view = useUiState(ui);
  const context = useMemo(() => ({ session, ui }), [session, ui]);

  // Full screen: the page's own follows the mode, and leaving the editor (unmounting it) leaves full screen.
  useEffect(() => watchFullScreen(ui), [ui]);

  // Keys pressed with focus anywhere in the editor that no region took. In a field only the chords that are never typing (`inFields`) are looked up.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A region that took the key called preventDefault on the native event; React's own flag is a copy made before that.
    if (event.defaultPrevented || event.nativeEvent.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(".ks-dialog")) return;
    dispatchKey(event.nativeEvent, context, target?.closest("input, textarea, select, [contenteditable='true']") ? "field" : "canvas");
  };

  return (
    <div
      className={view.fullScreen ? `${className} is-fullscreen` : className}
      data-theme={theme}
      onKeyDown={onKeyDown}
      onFocus={(event) => ui.areas.noteFocus(event.target)}
      onBlur={(event) => ui.areas.noteBlur(event.target, event.relatedTarget)}
    >
      <header className="ks-top">
        <TitleBar session={session} ui={ui} />
        <MenuBar session={session} ui={ui} />
        <Toolbar session={session} ui={ui} />
      </header>
      <div className="ks-body">
        {view.filmstripOpen && view.view === "edit" ? <Filmstrip session={session} ui={ui} /> : null}
        {view.galleryOpen && view.view === "edit" ? <GalleryDrawer session={session} ui={ui} /> : null}
        <main className="ks-center">
          {view.view === "edit" ? <SlideCanvas session={session} ui={ui} /> : null}
          {view.view === "outline" ? <OutlineView session={session} ui={ui} /> : null}
          {view.view === "grid" ? <GridView session={session} ui={ui} /> : null}
          {view.notesOpen && view.view === "edit" ? <NotesPane session={session} ui={ui} /> : null}
        </main>
        {view.panel ? <SidePanel session={session} ui={ui} /> : null}
      </div>
      <Dialogs session={session} ui={ui} />
      <ContextMenus session={session} ui={ui} />
    </div>
  );
}
