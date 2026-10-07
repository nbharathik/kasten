// Menus opened over an editor close with it, so none is left on screen
// acting on a page that has gone.

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import type { Popover } from "./popover";

const open = new WeakMap<EditorView, Set<Popover>>();

/** Keeps `menu` open no longer than `view`. */
export function closesWith(view: EditorView, menu: Popover): Popover {
  const menus = open.get(view) ?? new Set();
  for (const old of menus) if (!old.isOpen) menus.delete(old);
  open.set(view, menus.add(menu));
  return menu;
}

export const menusCloseWithEditor = $prose(
  () =>
    new Plugin({
      key: new PluginKey("KASTEN_MENUS_CLOSE"),
      view: (view) => ({
        destroy() {
          for (const menu of open.get(view) ?? []) menu.close();
          open.delete(view);
        },
      }),
    }),
);
