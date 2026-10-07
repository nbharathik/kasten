// Math nodes: `math_inline` for `$…$` in a line, `math_block` for
// `$$` lines. The block's TeX is its text, edited like code; KaTeX draws both
// (math-view.ts). Typing `$…$` makes inline math, `$$` and a space or Enter
// on an empty line starts a block, and Enter on a closing `$$` line leaves it.

import { InputRule, textblockTypeInputRule } from "@milkdown/kit/prose/inputrules";
import { keymap } from "@milkdown/kit/prose/keymap";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";
import { $inputRule, $nodeSchema, $prose } from "@milkdown/kit/utils";

export const mathInlineSchema = $nodeSchema("math_inline", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { value: { default: "" }, dollars: { default: 1 } },
  parseDOM: [
    {
      tag: "span[data-math]",
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.math ?? "", dollars: Number((dom as HTMLElement).dataset.dollars ?? 1) }),
    },
  ],
  toDOM: (node) => ["span", { "data-math": node.attrs.value, "data-dollars": String(node.attrs.dollars), class: "kasten-math" }],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? ""), dollars: Number(node.dollars ?? 1) });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, String(node.attrs.value), { dollars: node.attrs.dollars });
    },
  },
}));

export const mathBlockSchema = $nodeSchema("math_block", () => ({
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  attrs: { meta: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-math-block]",
      preserveWhitespace: "full",
      getAttrs: (dom) => ({ meta: (dom as HTMLElement).dataset.meta ?? "" }),
    },
  ],
  toDOM: (node) => ["div", { "data-math-block": "", "data-meta": node.attrs.meta, class: "kasten-math-block" }, ["pre", 0]],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.openNode(type, { meta: String(node.meta ?? "") });
      if (node.value) state.addText(String(node.value));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      state.addNode("math", undefined, node.textContent, { meta: node.attrs.meta || null });
    },
  },
}));

/** `$…$` just closed with a dollar: the span becomes math, under Pandoc's rule. */
export const mathInlineInputRule = $inputRule(
  (ctx) =>
    new InputRule(/(^|[^\\$])\$([^\s$](?:[^$]*[^\s$])?)\$$/, (state, match, start, end) => {
      const [, before = "", tex = ""] = match;
      const from = start + before.length;
      const $from = state.doc.resolve(from);
      if ($from.marks().some((mark) => mark.type.spec.code)) return null;
      return state.tr.replaceWith(from, end, mathInlineSchema.type(ctx).create({ value: tex, dollars: 1 }));
    }),
);

/** `$$` and a space at the start of an empty line starts a block. */
export const mathBlockInputRule = $inputRule((ctx) => textblockTypeInputRule(/^\$\$\s$/, mathBlockSchema.type(ctx)));

/** Enter on a line that is only `$$` starts a block; inside a block, Enter on
 * a closing `$$` line removes it and leaves the block. */
const enter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  const parent = $from.parent;
  const block = state.schema.nodes.math_block;
  if (!block) return false;
  if (parent.type === state.schema.nodes.paragraph && parent.textContent === "$$" && $from.parentOffset === 2) {
    if (dispatch) {
      const start = $from.start();
      const tr = state.tr.delete(start, start + 2).setBlockType(start, start, block);
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  if (parent.type !== block || $from.parentOffset !== parent.content.size) return false;
  const text = parent.textContent;
  if (!/(^|\n)\$\$$/.test(text)) return false;
  if (dispatch) {
    const start = $from.start();
    const cut = text.endsWith("\n$$") ? 3 : 2;
    const tr = state.tr.delete(start + text.length - cut, start + text.length);
    const after = tr.mapping.map($from.after());
    const paragraph = state.schema.nodes.paragraph!.create();
    tr.insert(after, paragraph).setSelection(TextSelection.create(tr.doc, after + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

export const mathKeymap = $prose(() => keymap({ Enter: enter }));
