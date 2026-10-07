// Pasting a web address over selected text links that text to it, as in
// Notion, instead of replacing it with the address. Anything else pastes
// as it always does.

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

/** A single http(s) or mailto address and nothing else. */
const ADDRESS = /^(?:https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+)$/i;

export function linkSelection(view: EditorView, text: string): boolean {
  const url = text.trim();
  const { state } = view;
  const { from, to, empty, $from, $to } = state.selection;
  const link = state.schema.marks.link;
  if (empty || !link || !ADDRESS.test(url) || !$from.sameParent($to) || !$from.parent.isTextblock) return false;
  if (!$from.parent.type.allowsMarkType(link)) return false;
  view.dispatch(state.tr.addMark(from, to, link.create({ href: url })).scrollIntoView());
  return true;
}

export const pasteLink = $prose(
  () =>
    new Plugin({
      key: new PluginKey("KASTEN_PASTE_LINK"),
      props: {
        // Before the clipboard plugin, which would paste the address as text.
        handleDOMEvents: {
          paste(view, event) {
            if (!view.editable || event.clipboardData?.files.length) return false;
            if (!linkSelection(view, event.clipboardData?.getData("text/plain") ?? "")) return false;
            event.preventDefault();
            return true;
          },
        },
      },
    }),
);
