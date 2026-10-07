import { type JSX, useLayoutEffect, useMemo, useRef } from "react";

import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { Menu } from "../ui/Menu.tsx";
import { pointAnchor } from "../ui/Popover.tsx";
import { useEditor } from "../useEditor.ts";
import { useUiState } from "../useUi.ts";
import { contextItems } from "./context-items.ts";
import { MENU_LIST, useFocusWhenShown } from "./focus.ts";
import "./menus.css";

/** Puts the focus back where it was when the menu goes, unless something else has taken it since (a dialog, a text box). */
function useRestoreFocus(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before?.isConnected && (document.activeElement === document.body || document.activeElement === null)) before.focus({ preventScroll: true });
    };
  }, [active]);
}

/** The menu a right click opens, on an element, on the empty slide, or on a slide in the filmstrip. */
export function ContextMenus({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element | null {
  useEditor(session);
  const menu = useUiState(ui).contextMenu;
  const ctx = useMemo(() => ({ session, ui }), [session, ui]);
  const root = useRef<HTMLDivElement>(null);
  // With a text box open the menu leaves the focus in it (as the menu bar does), so Select all and the rest act on its words.
  const keep = ui.state.text !== null;
  useRestoreFocus(menu !== null && !keep);
  useFocusWhenShown(root, menu && !keep ? MENU_LIST : null, menu);
  if (!menu) return null;
  return (
    <div ref={root} className="ks-context ks-contents">
      {/* The popover opens a few pixels below its anchor, so the menu starts at the pointer. */}
      <Menu items={contextItems(menu.kind, ctx)} anchor={pointAnchor(menu.x, menu.y - 4)} onClose={() => ui.openContextMenu(null)} keepFocus={keep} label="Context menu" />
    </div>
  );
}
