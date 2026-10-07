import { type JSX, type KeyboardEvent, useRef } from "react";

import type { EditorUi } from "../ui-state.ts";
import { Menu, type MenuItem } from "../ui/Menu.tsx";
import { MENU_FIRST_ROW, MENU_LIST, swallowKeys, useFocusWhenShown } from "./focus.ts";
import { type Dropdown, keepsEditorFocus } from "./useDropdown.ts";
import "./menus.css";

interface DropMenuProps {
  dd: Dropdown;
  ui: EditorUi;
  /** The rows, built when the menu is open. */
  items(): MenuItem[];
  label: string;
}

/**
 * The menu under a dropdown button. While it is open the keys belong to it:
 * they do not reach the editor's shortcuts (Delete must not delete the
 * selection), and Tab closes it.
 */
export function DropMenu({ dd, ui, items, label }: DropMenuProps): JSX.Element | null {
  const root = useRef<HTMLDivElement>(null);
  const keep = keepsEditorFocus(ui, dd.keyboard);
  // Opened by the keyboard the first row is ready; opened by the mouse the arrow keys work at once.
  useFocusWhenShown(root, dd.anchor && !keep ? (dd.keyboard ? MENU_FIRST_ROW : MENU_LIST) : null, dd.anchor);
  if (!dd.anchor) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") dd.close();
    swallowKeys(event);
  };
  return (
    <div ref={root} className="ks-contents" data-ks-keep-focus="" onKeyDown={onKeyDown}>
      <Menu items={items()} anchor={dd.anchor} onClose={dd.close} keepFocus={keep} label={label} />
    </div>
  );
}
