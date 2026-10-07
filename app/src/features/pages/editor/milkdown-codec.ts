// The lossless layer's view of a live Milkdown editor: its own remark parser
// for block positions, its parser and serializer for everything else.

import { parserCtx, remarkCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Node } from "@milkdown/kit/prose/model";

import type { MarkdownCodec } from "../markdown/lossless";
import { htmlBlockValue, type MdNode } from "./blocks/mdast";
import { findToggles } from "./blocks/toggle";

/** Top-level nodes of a document, in order. */
export function topLevel(doc: Node): Node[] {
  const nodes: Node[] = [];
  doc.forEach((n) => void nodes.push(n));
  return nodes;
}

export function milkdownCodec(ctx: Ctx): MarkdownCodec<Node> {
  const parser = ctx.get(parserCtx);
  const serializer = ctx.get(serializerCtx);
  const remark = ctx.get(remarkCtx);
  const schema = ctx.get(schemaCtx);

  return {
    blockRanges(markdown) {
      const { children } = remark.parse(markdown) as unknown as { children: MdNode[] };
      const offsets = (child: MdNode) => {
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        if (start === undefined || end === undefined) throw new Error(`no position on ${child.type}`);
        return { start, end };
      };
      // A toggle is several top-level siblings in Markdown but one block to edit.
      const toggles = new Map(findToggles(children, htmlBlockValue).map((t) => [t.start, t.end]));
      const ranges = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        const last = toggles.get(i) ?? i;
        ranges.push({
          start: offsets(child).start,
          end: offsets(children[last]!).end,
          context: child.type === "definition" || child.type === "footnoteDefinition",
        });
        i = last;
      }
      return ranges;
    },
    parse: (markdown) => topLevel(parser(markdown)),
    serialize: (nodes) => serializer(schema.topNodeType.create(null, nodes)),
    eq: (a, b) => a.eq(b),
    typeOf: (n) => n.type.name,
    isBlank: (n) => n.type.name === "paragraph" && n.childCount === 0,
  };
}
