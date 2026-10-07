// Toggles, stored as HTML details with Markdown inside:
//
//   <details>
//   <summary>Title</summary>
//
//   Body blocks.
//
//   </details>
//
// In the Markdown tree a toggle is several siblings: the opening HTML block,
// the body blocks and the closing HTML block. `findToggles` pairs them up, for
// the remark transform here and for the lossless layer's block ranges.

import { wrapIn } from "@milkdown/kit/prose/commands";
import type { Node } from "@milkdown/kit/prose/model";
import { $command, $nodeSchema, $remark } from "@milkdown/kit/utils";

import { eachParent, htmlBlockValue, type MdNode } from "./mdast";

const OPENER = /^<details(\s+open)?\s*>\s*(?:<summary>([\s\S]*?)<\/summary>)?$/i;
const SUMMARY = /^<summary>([\s\S]*?)<\/summary>$/i;
const CLOSER = /^<\/details>$/i;

/** Parents whose children are blocks; a toggle can only live there. */
const BLOCK_PARENTS = new Set(["root", "blockquote", "listItem", "callout", "toggle", "footnoteDefinition"]);

export interface ToggleSpan {
  /** Index of the opening HTML block. */
  start: number;
  /** Index of the closing HTML block. */
  end: number;
  /** Index of the first body block. */
  bodyStart: number;
  open: boolean;
  summary: string;
}

/** Toggles among sibling blocks, outermost only; unmatched openers are left alone. */
export function findToggles<T>(children: readonly T[], htmlOf: (child: T) => string | null): ToggleSpan[] {
  const value = (i: number) => {
    const child = children[i];
    const html = child === undefined ? null : htmlOf(child);
    return html === null ? null : html.trim();
  };
  const spans: ToggleSpan[] = [];
  for (let i = 0; i < children.length; i++) {
    const opener = OPENER.exec(value(i) ?? "");
    if (!opener) continue;
    let summary = opener[2];
    let bodyStart = i + 1;
    const separate = summary === undefined ? SUMMARY.exec(value(i + 1) ?? "") : null;
    if (separate) {
      summary = separate[1];
      bodyStart = i + 2;
    }
    let depth = 0;
    let end = -1;
    for (let j = bodyStart; j < children.length && end < 0; j++) {
      const html = value(j);
      if (html === null) continue;
      if (OPENER.test(html)) depth++;
      else if (CLOSER.test(html)) {
        if (depth === 0) end = j;
        else depth--;
      }
    }
    if (end < 0) continue;
    spans.push({ start: i, end, bodyStart, open: opener[1] !== undefined, summary: summary ?? "" });
    i = end;
  }
  return spans;
}

export interface ToggleAttrs {
  open: boolean;
  summary: string;
}

/** A toggle from pasted HTML. Its summary goes into the page's HTML as it
 * is, so a line break, or a tag that would end the toggle or run a script,
 * can't come with it. */
export function pastedToggle(data: DOMStringMap): ToggleAttrs {
  let summary = (data.summary ?? "").replace(/[\r\n]+/g, " ");
  if (/<\/?(summary|details|script|style|iframe|object|embed)\b/i.test(summary)) {
    summary = summary.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  return { open: data.open === "true", summary };
}

export function toggleOpener({ open, summary }: ToggleAttrs): string {
  return `<details${open ? " open" : ""}>\n<summary>${summary}</summary>`;
}

// unified plugins receive an untyped `this` processor.
export const remarkToggle = $remark("kastenToggle", () => function (this: unknown) {
  return (tree: unknown) => {
    eachParent(tree as MdNode, (parent) => {
      if (!BLOCK_PARENTS.has(parent.type)) return;
      const spans = findToggles(parent.children, htmlBlockValue);
      if (spans.length === 0) return;
      const children: MdNode[] = [];
      let k = 0;
      for (const s of spans) {
        children.push(...parent.children.slice(k, s.start));
        children.push({ type: "toggle", open: s.open, summary: s.summary, children: parent.children.slice(s.bodyStart, s.end) });
        k = s.end + 1;
      }
      children.push(...parent.children.slice(k));
      parent.children = children;
    });
  };
});

export const isBlankBody = (node: Node) =>
  node.childCount === 1 && node.firstChild?.type.name === "paragraph" && node.firstChild.content.size === 0;

export const toggleSchema = $nodeSchema("toggle", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: { open: { default: false }, summary: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-toggle]",
      getAttrs: (dom) => pastedToggle((dom as HTMLElement).dataset),
    },
  ],
  toDOM: (node) => [
    "div",
    { class: "kasten-toggle", "data-toggle": "", "data-open": String(node.attrs.open), "data-summary": node.attrs.summary },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === "toggle",
    runner: (state, node, type) => {
      state.openNode(type, { open: node.open, summary: node.summary });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "toggle",
    runner: (state, node) => {
      state.addNode("html", undefined, toggleOpener(node.attrs as ToggleAttrs));
      if (!isBlankBody(node)) state.next(node.content);
      state.addNode("html", undefined, "</details>");
    },
  },
}));

/** Wraps the current block in a collapsed toggle. */
export const wrapInToggleCommand = $command("WrapInToggle", (ctx) => () => wrapIn(toggleSchema.type(ctx), { open: false, summary: "" }));
