// What a paragraph's page element takes from the words around and in it: the
// text of its list marker (a number depends on the items before it) and the
// look of that marker and the size its lines are measured by (they depend on
// its runs). ProseMirror keeps these up to date as decorations, so the
// element is not redrawn, which would end an input method's composition.

import type { Node as PMNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { cssText } from "./css.ts";
import { nodeToParagraph } from "./convert.ts";
import { listNumbers, markerFor } from "./lists.ts";
import { paragraphOfAttrs } from "./paragraph-attrs.ts";
import { attrsOf } from "./schema.ts";
import type { EditorContext } from "./selection-info.ts";
import { paragraphFlowCss } from "./text-style.ts";

export function paragraphDecorations(ctx: EditorContext): Plugin {
  // A node that did not change keeps its style; nodes are new objects only when they change.
  const styles = new WeakMap<PMNode, string>();
  return new Plugin({
    props: {
      decorations(state) {
        const paragraphs: { node: PMNode; pos: number }[] = [];
        state.doc.forEach((node, pos) => paragraphs.push({ node, pos }));
        const numbers = listNumbers(paragraphs.map(({ node }) => attrsOf(node)));
        return DecorationSet.create(
          state.doc,
          paragraphs.map(({ node, pos }, index) => {
            let style = styles.get(node);
            if (style === undefined) styles.set(node, (style = cssText(paragraphFlowCss(ctx.theme, ctx.baseStyle, nodeToParagraph(node)))));
            const attrs = attrsOf(node);
            const onPage: Record<string, string> = { style };
            if (attrs.list) onPage["data-marker"] = markerFor(paragraphOfAttrs(attrs), numbers[index] ?? 1);
            return Decoration.node(pos, pos + node.nodeSize, onPage);
          }),
        );
      },
    },
  });
}
