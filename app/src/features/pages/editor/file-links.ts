// Links to vault files in a page, such as a highlight card's link back to
// its PDF (`../sources/x.pdf#page=3&highlight=…`): Ctrl or Cmd and a click
// follows one, as it follows a web link in most editors; with Shift too,
// in a new tab. A plain click still places the caret, to edit the link.

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { linksOf } from "./links";

export const fileLinks = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey("KASTEN_FILE_LINKS"),
      props: {
        handleDOMEvents: {
          click(_view, event) {
            if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
            const anchor = (event.target as Element | null)?.closest?.("a[href]");
            const href = anchor?.getAttribute("href");
            if (!href || !linksOf(ctx).openFile?.(href, event.shiftKey ? "tab" : "here")) return false;
            event.preventDefault();
            return true;
          },
        },
      },
    }),
);
