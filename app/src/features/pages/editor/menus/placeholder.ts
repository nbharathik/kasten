// Notion's placeholders: the empty block with the caret says what it is and
// how to change it ("Type '/' for commands", "Heading 1", "To-do", ...).

import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export function placeholderText(state: EditorState): string | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const block = $from.parent;
  if (!block.isTextblock || block.content.size > 0 || block.type.spec.code) return null;
  if (block.type.name === "heading") return `Heading ${String(block.attrs.level)}`;
  const parent = $from.depth > 1 ? $from.node(-1) : null;
  switch (parent?.type.name) {
    case "list_item":
      return typeof parent.attrs.checked === "boolean" ? "To-do" : "List";
    case "blockquote":
      return "Empty quote";
    case "callout":
      return "Type something…";
    case "toggle":
      return parent.childCount === 1 ? "Empty toggle. Type or drop blocks inside." : "Type '/' for commands";
    case "table_cell":
    case "table_header":
      return null;
    default:
      return "Type '/' for commands";
  }
}

export const placeholder = $prose(
  () =>
    new Plugin({
      key: new PluginKey("KASTEN_PLACEHOLDER"),
      props: {
        decorations(state) {
          const text = placeholderText(state);
          if (text === null) return null;
          const { $from } = state.selection;
          const start = $from.before();
          const attrs = { class: "kasten-placeholder", "data-placeholder": text };
          return DecorationSet.create(state.doc, [Decoration.node(start, start + $from.parent.nodeSize, attrs)]);
        },
      },
    }),
);
